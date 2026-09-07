1|import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
2|import { useEffect, useMemo, useRef, useState } from "react";
3|import { useMutation, useQueryClient } from "@tanstack/react-query";
4|import { useServerFn } from "@tanstack/react-start";
5|import { toast } from "sonner";
6|import { saveRouter, testRouter, testConnection } from "@/lib/routers.functions";
7|import {
8|  probeCloudDns,
9|  checkPublicReachability,
10|  executeQuickSetupRollback,
11|} from "@/lib/mikrotik.functions";
12|import { buildQuickSetupRollbackScript, buildQuickSetupScript } from "@/lib/quick-setup-script";
13|import { RemoteAccessChooser } from "@/components/RemoteAccessChooser";
14|import { copyText } from "@/lib/browser/clipboard";
15|import { toErrorMessage } from "@/lib/error-message";
16|
17|export const Route = createFileRoute("/_authenticated/app/quick-setup")({
18|  head: () => ({
19|    meta: [{ title: "Quick setup — MikroTik Magic" }, { name: "robots", content: "noindex" }],
20|  }),
21|  component: QuickSetup,
22|});
23|
24|type StepId = 1 | 2 | 3 | 4 | 5;
25|
26|function randomPassword(len = 20) {
27|  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
28|  let out = "";
29|  const arr = new Uint32Array(len);
30|  crypto.getRandomValues(arr);
31|  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
32|  return out;
33|}
34|
35|const DRAFT_KEY = "mm.quicksetup.draft.v1";
36|type Draft = {
37|  step: StepId;
38|  name: string;
39|  identity: string;
40|  apiUser: string;
41|  lanIp: string;
42|  ddnsHost: string;
43|  savedAt: string;
44|};
45|
46|const INTRO_KEY = "mm.quick-setup.intro.v1";
47|
48|function QuickSetup() {
49|  const [step, setStep] = useState<StepId>(1);
50|  const [name, setName] = useState("");
51|  const [identity, setIdentity] = useState("");
52|  const [apiUser, setApiUser] = useState("");
53|  const [apiPassword, setApiPassword] = useState("");
54|  const [ddnsHost, setDdnsHost] = useState("");
55|  const [savedRouterId, setSavedRouterId] = useState<string | null>(null);
56|  const [lanIp, setLanIp] = useState("192.168.88.1");
57|  const [backupTag] = useState(
58|    () =>
59|      `pre-magic-${new Date()
60|        .toISOString()
61|        .replace(/[-:T.Z]/g, "")
62|        .slice(0, 14)}`,
63|  );
64|  const [resumeAvailable, setResumeAvailable] = useState<Draft | null>(null);
65|  const [showIntro, setShowIntro] = useState(false);
66|  const [introSlide, setIntroSlide] = useState(0);
67|  const hydratedRef = useRef(false);
68|
69|  // Decide whether to show the intro click-through on mount.
70|  useEffect(() => {
71|    try {
72|      const forced = typeof window !== "undefined" && window.location.search.includes("intro=1");
73|      const seen = typeof window !== "undefined" && localStorage.getItem(INTRO_KEY) === "1";
74|      const hasDraft = typeof window !== "undefined" && !!localStorage.getItem(DRAFT_KEY);
75|      if (forced || (!seen && !hasDraft)) setShowIntro(true);
76|    } catch {
77|      /* storage unavailable */
78|    }
79|  }, []);
80|
81|  // Load draft on mount (never persist password)
82|  useEffect(() => {
83|    try {
84|      const raw = localStorage.getItem(DRAFT_KEY);
85|      if (!raw) return;
86|      const d = JSON.parse(raw) as Draft;
87|      if (d && typeof d.step === "number" && d.step > 1) setResumeAvailable(d);
88|    } catch {
89|      /* storage unavailable */
90|    }
91|  }, []);
92|
93|  // Persist on change (skip step 5 done-state until reset)
94|  useEffect(() => {
95|    if (!hydratedRef.current) {
96|      hydratedRef.current = true;
97|      return;
98|    }
99|    if (step === 1 && !name && !identity && !apiUser) return;
100|    try {
101|      const draft: Draft = {
102|        step,
103|        name,
104|        identity,
105|        apiUser,
106|        lanIp,
107|        ddnsHost,
108|        savedAt: new Date().toISOString(),
109|      };
110|      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
111|    } catch {
112|      /* storage unavailable */
113|    }
114|  }, [step, name, identity, apiUser, lanIp, ddnsHost]);
115|
116|  const clearDraft = () => {
117|    try {
118|      localStorage.removeItem(DRAFT_KEY);
119|    } catch {
120|      /* storage unavailable */
121|    }
122|    setResumeAvailable(null);
123|  };
124|
125|  const resumeDraft = () => {
126|    if (!resumeAvailable) return;
127|    setName(resumeAvailable.name);
128|    setIdentity(resumeAvailable.identity);
129|    setApiUser(resumeAvailable.apiUser);
130|    setLanIp(resumeAvailable.lanIp || "192.168.88.1");
131|    setDdnsHost(resumeAvailable.ddnsHost);
132|    setStep(resumeAvailable.step);
133|    setResumeAvailable(null);
134|  };
135|
136|  // Per-step validation
137|  const step1Errors = useMemo(() => {
138|    const errs: string[] = [];
139|    if (!name.trim()) errs.push("Router name is required.");
140|    if (!identity.trim()) errs.push("System identity is required.");
141|    else if (!/^[a-zA-Z0-9._-]+$/.test(identity))
142|      errs.push("Identity may only contain letters, digits, . _ -");
143|    if (!apiUser.trim()) errs.push("API username is required.");
144|    else if (!/^[a-zA-Z0-9._-]+$/.test(apiUser))
145|      errs.push("API username may only contain letters, digits, . _ -");
146|    if (!apiPassword) errs.push("API password is required.");
147|    else if (apiPassword.length < 8) errs.push("API password should be at least 8 characters.");
148|    return errs;
149|  }, [name, identity, apiUser, apiPassword]);
150|  const step1Valid = step1Errors.length === 0;
151|
152|  const qc = useQueryClient();
153|  const navigate = useNavigate();
154|  const save = useServerFn(saveRouter);
155|  const test = useServerFn(testRouter);
156|  const probe = useServerFn(probeCloudDns);
157|  const reachability = useServerFn(checkPublicReachability);
158|  const runRollback = useServerFn(executeQuickSetupRollback);
159|
160|  const rollbackMut = useMutation({
161|    mutationFn: async (mode: "soft" | "hard") => {
162|      const host = ddnsHost.trim();
163|      if (!host) {
164|        throw new Error(
165|          "Enter the Cloud DDNS hostname first. One-click rollback runs from the cloud and cannot dial a LAN IP — use Download .rsc in Winbox if you only have a LAN address.",
166|        );
167|      }
168|      if (!apiUser.trim() || !apiPassword)
169|        throw new Error("API username/password required (Step 1).");
170|      const res = await runRollback({
171|        data: {
172|          host,
173|          port: 443,
174|          username: apiUser.trim(),
175|          password: apiPassword,
176|          useTls: true,
177|          apiUser: apiUser.trim(),
178|          backupTag,
179|          mode,
180|          // The wizard installed a self-signed certificate on this router.
181|          allowSelfSigned: true,
182|        },
183|      });
184|      if (!res.ok) throw new Error(res.error);
185|      return res;
186|    },
187|  });
188|
189|  const script = useMemo(
190|    () => buildQuickSetupScript({ apiUser, apiPassword, identity, backupTag }),
191|    [apiUser, apiPassword, identity, backupTag],
192|  );
193|  const rollbackScript = useMemo(
194|    () => buildQuickSetupRollbackScript({ apiUser, backupTag }),
195|    [apiUser, backupTag],
196|  );
197|
198|  const reachMut = useMutation({
199|    mutationFn: async (host?: string) =>
200|      reachability({ data: { host: host?.trim() || undefined, port: 443 } }),
201|  });
202|
203|  const detectMut = useMutation({
204|    mutationFn: async () => {
205|      const host = ddnsHost.trim();
206|      if (!host) {
207|        throw new Error(
208|          "Paste the Cloud DDNS hostname the setup script printed (e.g. xxx.sn.mynetname.net). This app runs in the cloud and cannot dial your LAN IP.",
209|        );
210|      }
211|      if (!apiUser.trim() || !apiPassword)
212|        throw new Error("Enter the API username and password in Step 1 first.");
213|      const res = await probe({
214|        data: { host, port: 443, username: apiUser.trim(), password: apiPassword, useTls: true },
215|      });
216|
217|      if (!res.ok) throw new Error(res.error);
218|      setDdnsHost(res.dnsName);
219|      return res;
220|    },
221|  });
222|
223|  const testConn = useServerFn(testConnection);
224|  const testConnMut = useMutation({
225|    mutationFn: async () => {
226|      const host = ddnsHost.trim();
227|      if (!host) throw new Error("Enter (or auto-detect) the Cloud DDNS hostname first.");
228|      if (!apiUser.trim() || !apiPassword)
229|        throw new Error("API username and password are required (Step 1).");
230|      const res = await testConn({
231|        data: { host, port: 443, username: apiUser.trim(), password: apiPassword, useTls: true },
232|      });
233|      if (!res.ok) throw new Error(res.error ?? "Connection test failed");
234|      return res;
235|    },
236|  });
237|
238|  const registerMut = useMutation({
239|    mutationFn: async () => {
240|      const host = ddnsHost.trim();
241|      if (!host) throw new Error("Enter the Cloud DDNS hostname from the router.");
242|      if (!testConnMut.data?.ok)
243|        throw new Error("Run the connection test successfully before saving.");
244|      const res = await save({
245|        data: {
246|          name,
247|          host,
248|          port: 443,
249|          username: apiUser,
250|          password: apiPassword,
251|          useTls: true,
252|          allowInsecureTls: true,
253|          insecureTlsReason:
254|            "Quick Setup installs a self-signed certificate on the router; recorded as a temporary exception.",
255|          isDefault: false,
256|        },
257|      });
258|      setSavedRouterId(res.id);
259|      // Confirm the saved record is reachable end-to-end (uses the encrypted password).
260|      const t = await test({ data: { id: res.id } });
261|      if (!t.ok) throw new Error(t.error ?? "Router saved but not reachable");
262|      await qc.invalidateQueries({ queryKey: ["routers"] });
263|      return t;
264|    },
265|    onSuccess: () => {
266|      setStep(5);
267|      try {
268|        localStorage.removeItem(DRAFT_KEY);
269|      } catch {
270|        /* storage unavailable */
271|      }
272|      toast.success(`Router "${name}" created and reachable`, {
273|        description: "Redirecting to Routers…",
274|      });
275|      setTimeout(() => {
276|        navigate({ to: "/app/routers" });
277|      }, 900);
278|    },
279|  });
280|
281|  // Invalidate a prior successful test if the user edits inputs afterwards —
282|  // they must re-test before we let them create the router.
283|  const testResetRef = useRef(testConnMut.reset);
284|  testResetRef.current = testConnMut.reset;
285|  const registerResetRef = useRef(registerMut.reset);
286|  registerResetRef.current = registerMut.reset;
287|  useEffect(() => {
288|    testResetRef.current();
289|    registerResetRef.current();
290|  }, [ddnsHost, apiUser, apiPassword]);
291|
292|  const busy = testConnMut.isPending || registerMut.isPending;
293|  const busyLabel = registerMut.isPending
294|    ? "Creating router…"
295|    : testConnMut.isPending
296|      ? "Testing connection…"
297|      : "";
298|
299|  const downloadFile = (content: string, filename: string) => {
300|    try {
301|      const blob = new Blob([content], { type: "application/octet-stream" });
302|      const url = URL.createObjectURL(blob);
303|      const a = document.createElement("a");
304|      a.href = url;
305|      a.download = filename;
306|      a.rel = "noopener";
307|      a.style.display = "none";
308|      document.body.appendChild(a);
309|      a.click();
310|      setTimeout(() => {
311|        document.body.removeChild(a);
312|        URL.revokeObjectURL(url);
313|      }, 100);
314|      toast.success(`Downloaded ${filename}`);
315|    } catch (e) {
316|      toast.error(toErrorMessage(e, "Download failed"));
317|    }
318|  };
319|  const downloadRsc = () => downloadFile(script, "magicsetup.rsc");
320|  const downloadRollback = () => downloadFile(rollbackScript, "rollback.rsc");
321|
322|  const copyScript = async () => {
323|    const ok = await copyText(script);
324|    if (ok) toast.success("Setup script copied");
325|    else toast.error("Copy failed — use Download instead");
326|  };
327|  const copyRollback = async () => {
328|    const ok = await copyText(rollbackScript);
329|    if (ok) toast.success("Rollback script copied");
330|    else toast.error("Copy failed — use Download instead");
331|  };
332|
333|  const openWinbox = () => {
334|    const target = lanIp.trim() || "MikroTik";
335|    window.location.href = `winbox://${encodeURIComponent(target)}`;
336|  };
337|
338|  // Auto-run reachability once when reaching step 2
339|  const reachAutoRef = useRef(false);
340|  useEffect(() => {
341|    if (step === 2 && !reachAutoRef.current && !reachMut.data && !reachMut.isPending) {
342|      reachAutoRef.current = true;
343|      reachMut.mutate(undefined);
344|    }
345|  }, [step, reachMut]);
346|
347|  const highestStep = useRef<StepId>(1);
348|  if (step > highestStep.current) highestStep.current = step;
349|
350|  return (
351|    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
352|      {showIntro && (
353|        <IntroTour
354|          slide={introSlide}
355|          onNext={() => setIntroSlide((s) => Math.min(s + 1, 3))}
356|          onBack={() => setIntroSlide((s) => Math.max(s - 1, 0))}
357|          onStart={() => {
358|            try {
359|              localStorage.setItem(INTRO_KEY, "1");
360|            } catch {
361|              /* storage unavailable */
362|            }
363|            setShowIntro(false);
364|          }}
365|          onSkip={() => {
366|            try {
367|              localStorage.setItem(INTRO_KEY, "1");
368|            } catch {
369|              /* storage unavailable */
370|            }
371|            setShowIntro(false);
372|          }}
373|        />
374|      )}
375|      {!showIntro && <RemoteAccessChooser compact />}
376|      <header className="space-y-2">
377|        <div className="flex items-center justify-between gap-3">
378|          <h1 className="text-2xl font-semibold">Quick setup</h1>
379|          <button
380|            type="button"
381|            onClick={() => {
382|              setIntroSlide(0);
383|              setShowIntro(true);
384|            }}
385|            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
386|          >
387|            Show tour
388|          </button>
389|        </div>
390|        <p className="text-sm text-muted-foreground">
391|          Guided wizard to expose RouterOS REST — Cloud DDNS, self-signed TLS on 443, and a
392|          dedicated API user, all in one script. Use this when the router can be reached from the
393|          internet.
394|        </p>
395|        <div className="rounded-xl border border-border bg-card/50 p-3 text-xs text-muted-foreground">
396|          <b className="text-foreground">No public IP or CGNAT?</b> Skip this wizard and pair a
397|          local MikroTik Magic Connector instead: install the agent on an always-on machine in the
398|          same LAN, then set the router's connection method to “Local Connector”. Nothing is exposed
399|          to the internet.{" "}
400|          <Link to="/app/connectors" className="text-primary underline underline-offset-2">
401|            Open the connector setup wizard
402|          </Link>
403|          .
404|        </div>
405|      </header>
406|
407|      {resumeAvailable && (
408|        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
409|          <div>
410|            <div className="font-medium">Resume where you left off?</div>
411|            <div className="text-xs text-muted-foreground">
412|              Draft from {new Date(resumeAvailable.savedAt).toLocaleString()} · Step{" "}
413|              {resumeAvailable.step} · {resumeAvailable.name || "(unnamed router)"}. Password isn't
414|              stored — you'll re-enter it.
415|            </div>
416|          </div>
417|          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
418|            <button className="btn-primary min-h-[44px]" onClick={resumeDraft} type="button">
419|              Resume
420|            </button>
421|            <button className="btn-ghost min-h-[44px]" onClick={clearDraft} type="button">
422|              Start fresh
423|            </button>
424|          </div>
425|        </div>
426|      )}
427|
428|      <div className="sticky top-2 z-10 -mx-1 rounded-xl border border-border bg-background/85 px-3 py-2 backdrop-blur-md sm:-mx-1 sm:px-2">
429|        <Stepper
430|          step={step}
431|          maxReached={highestStep.current}
432|          onJump={(n) => n <= highestStep.current && setStep(n)}
433|          disabled={busy}
434|        />
435|        {busy && (
436|          <div className="mt-2" role="status" aria-live="polite">
437|            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
438|              <div className="h-full w-1/3 animate-[qs-progress_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
439|            </div>
440|            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
441|              <span
442|                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
443|                aria-hidden="true"
444|              />
445|              {busyLabel}
446|            </div>
447|            <style>{`@keyframes qs-progress{0%{transform:translateX(-100%)}50%{transform:translateX(100%)}100%{transform:translateX(300%)}}`}</style>
448|          </div>
449|        )}
450|      </div>
451|
452|      {step === 1 && (
453|        <Card title="Step 1 · Name & credentials">
454|          <div className="space-y-4">
455|            <Field label="Router name (shown in this app)">
456|              <input
457|                className="input min-h-[44px]"
458|                value={name}
459|                onChange={(e) => setName(e.target.value)}
460|                placeholder="e.g. Hotspot RouterBoard"
461|                maxLength={80}
462|                aria-invalid={!name.trim() && step1Errors.length > 0}
463|              />
464|            </Field>
465|            <Field label="RouterOS system identity">
466|              <input
467|                className="input min-h-[44px]"
468|                value={identity}
469|                onChange={(e) => setIdentity(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))}
470|                placeholder="e.g. mikrotik-hotspot"
471|                maxLength={40}
472|              />
473|            </Field>
474|            <Field label="API username (created on the router)">
475|              <input
476|                className="input min-h-[44px]"
477|                value={apiUser}
478|                onChange={(e) => setApiUser(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))}
479|                placeholder="e.g. mikrotik-magic"
480|                maxLength={40}
481|              />
482|            </Field>
483|            <Field label="API password">
484|              <div className="flex flex-col gap-2 sm:flex-row">
485|                <input
486|                  className="input w-full font-mono min-h-[44px]"
487|                  value={apiPassword}
488|                  onChange={(e) => setApiPassword(e.target.value)}
489|                  placeholder="e.g. JXvkLmipLfntMSpMniV5"
490|                  maxLength={64}
491|                />
492|                <button
493|                  className="btn-ghost w-full whitespace-nowrap min-h-[44px] sm:w-auto"
494|                  onClick={() => void copyText(apiPassword)}
495|                  type="button"
496|                >
497|                  Copy
498|                </button>
499|              </div>
500|              <p className="mt-2 text-xs text-muted-foreground">
501|                Enter your own password (8+ chars). Save it now — the app stores it encrypted after
502|                Step 4.
503|              </p>
504|            </Field>
505|
506|            {!step1Valid && (name || identity || apiUser || apiPassword) && (
507|              <ul className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">
508|                {step1Errors.map((e) => (
509|                  <li key={e}>• {e}</li>
510|                ))}
511|              </ul>
512|            )}
513|
514|            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
515|              <button
516|                className="btn-primary w-full min-h-[44px] disabled:opacity-50 sm:w-auto"
517|                onClick={() => setStep(2)}
518|                disabled={!step1Valid}
519|              >
520|                Continue
521|              </button>
522|            </div>
523|          </div>
524|        </Card>
525|      )}
526|
527|      {step === 2 && (
528|        <Card title="Step 2 · Open Winbox on the RouterBoard">
529|          <ol className="list-decimal space-y-3 pl-5 text-sm">
530|            <li>
531|              Connect your laptop to the RouterBoard (LAN cable or Wi-Fi) and open the Winbox
532|              desktop app.
533|            </li>
534|            <li>
535|              In Winbox's <em>Neighbors</em> tab, click your RouterBoard's MAC or IP and sign in.
536|            </li>
537|            <li>
538|              Optional shortcut on Windows/macOS with Winbox installed:
539|              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
540|                <input
541|                  className="input w-full min-h-[44px] sm:w-[200px]"
542|                  value={lanIp}
543|                  onC
544|
545|... [OUTPUT TRUNCATED - 4,334 chars omitted out of 54,262 total] ...
546|
547|ost w-full min-h-[44px] whitespace-nowrap sm:w-auto"
548|                onClick={() => detectMut.mutate()}
549|                disabled={detectMut.isPending || !ddnsHost.trim()}
550|                title="Reads /ip cloud over the public DDNS hostname (cloud cannot dial LAN IPs)"
551|              >
552|                {detectMut.isPending ? "Verifying…" : "Verify DDNS hostname"}
553|              </button>
554|            </div>
555|            <p className="mt-1 text-xs text-muted-foreground">
556|              Paste the Host value from the setup script terminal. Verify confirms DDNS is enabled
557|              and returns the canonical dns-name over <code>:443</code>. This app cannot dial your
558|              LAN IP from the cloud — use Local Connector for LAN-only sites.
559|            </p>
560|            {detectMut.isError && (
561|              <p className="mt-2 text-xs text-destructive">{(detectMut.error as Error).message}</p>
562|            )}
563|            {detectMut.data && "ok" in detectMut.data && detectMut.data.ok && (
564|              <p className="mt-2 text-xs text-emerald-400">
565|                Verified <code>{detectMut.data.dnsName}</code>
566|                {detectMut.data.publicAddress ? ` → ${detectMut.data.publicAddress}` : ""}
567|              </p>
568|            )}
569|          </Field>
570|          {registerMut.isError && (
571|            <div className="mt-3 space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
572|              <div className="text-destructive">
573|                <b>Connection test failed:</b> {(registerMut.error as Error).message}
574|              </div>
575|              <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
576|                <div className="mb-2 font-semibold text-amber-200">Roll back the router</div>
577|                Something isn't reachable — revert the last changes before troubleshooting.
578|                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
579|                  <button
580|                    className="btn-primary w-full min-h-[44px] sm:w-auto"
581|                    onClick={() => {
582|                      if (
583|                        confirm(
584|                          "Run soft rollback now?\n\nThis connects to the router with the wizard credentials and removes only what the setup added (API user, cert, disables www-ssl). DDNS/DNS/identity are kept.",
585|                        )
586|                      ) {
587|                        rollbackMut.mutate("soft");
588|                      }
589|                    }}
590|                    disabled={rollbackMut.isPending}
591|                    type="button"
592|                  >
593|                    {rollbackMut.isPending && rollbackMut.variables === "soft"
594|                      ? "Rolling back…"
595|                      : "One-click rollback (soft)"}
596|                  </button>
597|                  <button
598|                    className="btn-ghost w-full min-h-[44px] sm:w-auto"
599|                    onClick={() => {
600|                      if (
601|                        confirm(
602|                          `Hard restore will run /system backup load name=${backupTag} on the router. This reverts EVERYTHING (DDNS, DNS, identity) and REBOOTS the router. Continue?`,
603|                        )
604|                      ) {
605|                        rollbackMut.mutate("hard");
606|                      }
607|                    }}
608|                    disabled={rollbackMut.isPending}
609|                    type="button"
610|                  >
611|                    {rollbackMut.isPending && rollbackMut.variables === "hard"
612|                      ? "Restoring…"
613|                      : "Hard restore + reboot"}
614|                  </button>
615|                  <div className="grid grid-cols-2 gap-2 sm:contents">
616|                    <button
617|                      className="btn-ghost min-h-[44px] sm:min-h-0"
618|                      onClick={downloadRollback}
619|                      type="button"
620|                    >
621|                      Download .rsc
622|                    </button>
623|                    <button
624|                      className="btn-ghost min-h-[44px] sm:min-h-0"
625|                      onClick={copyRollback}
626|                      type="button"
627|                    >
628|                      Copy
629|                    </button>
630|                  </div>
631|                </div>
632|                {rollbackMut.isSuccess && (
633|                  <p className="mt-2 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-100">
634|                    ✓ {rollbackMut.data.message}
635|                  </p>
636|                )}
637|                {rollbackMut.isError && (
638|                  <p className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
639|                    Rollback failed: {(rollbackMut.error as Error).message}. Use the download/copy
640|                    fallback and import in Winbox.
641|                  </p>
642|                )}
643|                <details open className="mt-2">
644|                  <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider opacity-80 sm:hidden">
645|                    What do these do?
646|                  </summary>
647|                  <ul className="mt-2 list-disc space-y-1 pl-5">
648|                    <li>
649|                      <b>One-click soft:</b> we run the rollback for you over the same REST
650|                      connection — no Winbox needed.
651|                    </li>
652|                    <li>
653|                      <b>Fallback:</b> if REST is unreachable, download/copy the .rsc and import via
654|                      Winbox → Files.
655|                    </li>
656|                    <li>
657|                      <b>Hard restore:</b> loads binary backup <code>{backupTag}</code>; router
658|                      reboots to pre-setup state.
659|                    </li>
660|                  </ul>
661|                </details>
662|              </div>
663|              <details className="text-xs">
664|                <summary className="cursor-pointer text-muted-foreground">
665|                  Show rollback script
666|                </summary>
667|                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono">
668|                  {rollbackScript}
669|                </pre>
670|              </details>
671|            </div>
672|          )}
673|
674|          <div className="mt-4 rounded-lg border border-border bg-surface/40 p-3">
675|            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
676|              <div className="min-w-0">
677|                <div className="text-sm font-medium">Test the connection</div>
678|                <div className="text-xs text-muted-foreground">
679|                  Uses host <code>{ddnsHost || "<hostname>"}</code>:443 with API user{" "}
680|                  <code>{apiUser || "<user>"}</code>. The router is only created after the test
681|                  succeeds.
682|                </div>
683|              </div>
684|              <button
685|                type="button"
686|                className="btn-ghost inline-flex w-full min-h-[44px] items-center justify-center gap-2 whitespace-nowrap sm:w-auto"
687|                onClick={() => testConnMut.mutate()}
688|                disabled={busy || !ddnsHost || !apiUser || !apiPassword}
689|              >
690|                {testConnMut.isPending && (
691|                  <span
692|                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
693|                    aria-hidden="true"
694|                  />
695|                )}
696|                {testConnMut.isPending
697|                  ? "Testing…"
698|                  : testConnMut.data?.ok
699|                    ? "Re-test"
700|                    : "Test connection"}
701|              </button>
702|            </div>
703|            {(testConnMut.data || testConnMut.isError) && (
704|              <ul className="mt-3 space-y-1 text-xs">
705|                {testConnMut.data?.steps?.map((s, i) => (
706|                  <li key={i} className="flex items-start gap-2">
707|                    <span
708|                      className={
709|                        s.status === "ok"
710|                          ? "text-emerald-400"
711|                          : s.status === "fail"
712|                            ? "text-destructive"
713|                            : s.status === "warn"
714|                              ? "text-amber-400"
715|                              : "text-muted-foreground"
716|                      }
717|                      aria-hidden="true"
718|                    >
719|                      {s.status === "ok"
720|                        ? "✓"
721|                        : s.status === "fail"
722|                          ? "✕"
723|                          : s.status === "warn"
724|                            ? "!"
725|                            : "·"}
726|                    </span>
727|                    <span className="min-w-0">
728|                      <b>{s.name}</b>
729|                      {s.detail ? (
730|                        <>
731|                          {" "}
732|                          — <span className="text-muted-foreground">{s.detail}</span>
733|                        </>
734|                      ) : null}
735|                    </span>
736|                  </li>
737|                ))}
738|                {testConnMut.isError && (
739|                  <li className="text-destructive">{(testConnMut.error as Error).message}</li>
740|                )}
741|                {testConnMut.data?.ok && (
742|                  <li className="mt-1 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-200">
743|                    ✓ Reachable. You can now create the router.
744|                  </li>
745|                )}
746|                {testConnMut.data &&
747|                !testConnMut.data.ok &&
748|                testConnMut.data.remediation?.length ? (
749|                  <li className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-100">
750|                    <div className="mb-1 font-semibold">Fix checklist</div>
751|                    <ul className="list-disc space-y-0.5 pl-5">
752|                      {testConnMut.data.remediation.map((r, i) => (
753|                        <li key={i}>{r}</li>
754|                      ))}
755|                    </ul>
756|                  </li>
757|                ) : null}
758|              </ul>
759|            )}
760|          </div>
761|
762|          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
763|            <button
764|              className="btn-ghost w-full min-h-[44px] sm:w-auto"
765|              onClick={() => setStep(3)}
766|              disabled={busy}
767|            >
768|              Back
769|            </button>
770|            <button
771|              className="btn-primary inline-flex w-full min-h-[44px] items-center justify-center gap-2 sm:w-auto"
772|              onClick={() => registerMut.mutate()}
773|              disabled={busy || !testConnMut.data?.ok}
774|              title={
775|                !testConnMut.data?.ok ? "Run the connection test successfully first" : undefined
776|              }
777|            >
778|              {registerMut.isPending && (
779|                <span
780|                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
781|                  aria-hidden="true"
782|                />
783|              )}
784|              {registerMut.isPending ? "Creating…" : "Create router"}
785|            </button>
786|          </div>
787|        </Card>
788|      )}
789|
790|      {step === 5 && (
791|        <Card title="✓ You're good to go">
792|          <p className="text-sm">
793|            <strong>{name}</strong> is registered and reachable from the cloud at{" "}
794|            <code>{ddnsHost}</code>. Head to Live users, Vouchers, or the Portal editor to start
795|            managing it.
796|          </p>
797|          {savedRouterId && (
798|            <p className="mt-2 text-xs text-muted-foreground">
799|              Stored under router id <code>{savedRouterId}</code>.
800|            </p>
801|          )}
802|          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
803|            <a
804|              href="/app/routers"
805|              className="btn-primary inline-flex w-full min-h-[44px] items-center justify-center sm:w-auto"
806|            >
807|              Open Routers
808|            </a>
809|            <a
810|              href="/app/live"
811|              className="btn-ghost inline-flex w-full min-h-[44px] items-center justify-center sm:w-auto"
812|            >
813|              Live users
814|            </a>
815|            <button
816|              className="btn-ghost w-full min-h-[44px] sm:w-auto"
817|              onClick={() => {
818|                setStep(1);
819|                setSavedRouterId(null);
820|                setDdnsHost("");
821|                setApiPassword("");
822|              }}
823|            >
824|              Set up another router
825|            </button>
826|          </div>
827|        </Card>
828|      )}
829|    </div>
830|  );
831|}
832|
833|function Stepper({
834|  step,
835|  maxReached,
836|  onJump,
837|  disabled,
838|}: {
839|  step: StepId;
840|  maxReached?: StepId;
841|  onJump?: (n: StepId) => void;
842|  disabled?: boolean;
843|}) {
844|  const labels = ["Credentials", "Open Winbox", "Run script", "Register", "Done"];
845|  const reached = maxReached ?? step;
846|  return (
847|    <>
848|      {/* Compact tracker for phones */}
849|      <div className="flex items-center gap-3 sm:hidden">
850|        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary bg-primary text-[11px] font-semibold text-primary-foreground">
851|          {step}
852|        </span>
853|        <div className="min-w-0 flex-1">
854|          <div className="truncate text-xs font-medium">{labels[step - 1]}</div>
855|          <div className="text-[11px] text-muted-foreground">
856|            Step {step} of {labels.length}
857|          </div>
858|        </div>
859|        <div className="flex shrink-0 items-center">
860|          {labels.map((label, i) => {
861|            const n = (i + 1) as StepId;
862|            const jumpable = onJump && n <= reached && n !== step;
863|            const pill =
864|              n === step
865|                ? "w-5 bg-primary"
866|                : n < step
867|                  ? "w-1.5 bg-primary/50"
868|                  : "w-1.5 bg-muted-foreground/30";
869|            return jumpable ? (
870|              <button
871|                key={label}
872|                type="button"
873|                disabled={disabled}
874|                onClick={() => onJump!(n)}
875|                aria-label={`Go to step ${n}: ${label}`}
876|                className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-all disabled:opacity-50"
877|              >
878|                <span className={`h-1.5 rounded-full transition-all ${pill}`} aria-hidden />
879|              </button>
880|            ) : (
881|              <span
882|                key={label}
883|                className="inline-flex h-11 w-11 items-center justify-center"
884|                aria-hidden="true"
885|              >
886|                <span className={`h-1.5 rounded-full transition-all ${pill}`} />
887|              </span>
888|            );
889|          })}
890|        </div>
891|      </div>
892|
893|      {/* Full tracker from small screens up */}
894|      <ol className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:flex">
895|        {labels.map((label, i) => {
896|          const n = (i + 1) as StepId;
897|          const state = n < step ? "done" : n === step ? "active" : "todo";
898|          const jumpable = onJump && n <= reached;
899|          const bubble = (
900|            <>
901|              <span
902|                className={
903|                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] " +
904|                  (state === "active"
905|                    ? "border-primary bg-primary text-primary-foreground"
906|                    : state === "done"
907|                      ? "border-primary/60 bg-primary/20 text-primary"
908|                      : "border-border text-muted-foreground")
909|                }
910|              >
911|                {n}
912|              </span>
913|              <span className={state === "todo" ? "text-muted-foreground" : ""}>{label}</span>
914|            </>
915|          );
916|          return (
917|            <li key={label} className="flex items-center gap-2">
918|              {jumpable ? (
919|                <button
920|                  type="button"
921|                  onClick={() => onJump!(n)}
922|                  disabled={disabled}
923|                  className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
924|                  aria-label={`Go to step ${n}: ${label}`}
925|                >
926|                  {bubble}
927|                </button>
928|              ) : (
929|                <span className="flex items-center gap-2">{bubble}</span>
930|              )}
931|              {i < labels.length - 1 && <span className="text-muted-foreground">→</span>}
932|            </li>
933|          );
934|        })}
935|      </ol>
936|    </>
937|  );
938|}
939|
940|function Card({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
941|  return (
942|    <section className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-2xl transition-all hover:border-primary/30 sm:p-8">
943|      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl transition-all group-hover:bg-primary/20" />
944|      <div className="relative flex items-center justify-between mb-6">
945|        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
946|        {badge && (
947|          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
948|            {badge}
949|          </span>
950|        )}
951|      </div}
952|      {children}
953|    </section>
954|  );
955|}
956|
957|function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
958|  return (
959|    <label className="block space-y-1.5">
960|      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
961|        {label}
962|      </span>
963|      {children}
964|      {hint && <p className="mt-1 text-xs text-muted-foreground/60">{hint}</p>}
965|    </label>
966|  );
967|}
968|
969|function ScriptRow({
970|  badge,
971|  tone,
972|  filename,
973|  title,
974|  subtitle,
975|  onDownload,
976|  onCopy,
977|}: {
978|  badge: string;
979|  tone: "primary" | "ghost";
980|  filename: string;
981|  title: string;
982|  subtitle: string;
983|  onDownload: () => void;
984|  onCopy: () => void;
985|}) {
986|  const accent =
987|    tone === "primary"
988|      ? "from-primary/25 via-primary/10 to-transparent border-primary/40"
989|      : "from-accent/15 via-accent/5 to-transparent border-border";
990|  return (
991|    <div
992|      className={`rounded-2xl border bg-gradient-to-br ${accent} p-3 backdrop-blur-xl transition hover:border-primary/60 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-4`}
993|    >
994|      <div className="flex items-start gap-3 sm:contents">
995|        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/15 text-sm font-semibold text-primary sm:h-11 sm:w-11">
996|          {badge}
997|        </div>
998|        <div className="min-w-0">
999|          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
1000|            <span className="text-sm font-semibold text-foreground">{title}</span>
1001|            <code className="rounded-md border border-border/60 bg-black/30 px-1.5 py-0.5 text-[11px] text-primary">
1002|              {filename}
1003|            </code>
1004|          </div>
1005|          <p className="mt-1 text-xs text-muted-foreground sm:truncate">{subtitle}</p>
1006|        </div>
1007|      </div>
1008|      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0">
1009|        <button
1010|          type="button"
1011|          onClick={onDownload}
1012|          className={
1013|            tone === "primary"
1014|              ? "btn-primary min-h-[44px] whitespace-nowrap sm:min-h-[40px]"
1015|              : "btn-ghost min-h-[44px] whitespace-nowrap sm:min-h-[40px]"
1016|          }
1017|        >
1018|          ↓ Download
1019|        </button>
1020|        <button
1021|          type="button"
1022|          onClick={onCopy}
1023|          className="btn-ghost min-h-[44px] whitespace-nowrap sm:min-h-[40px]"
1024|          title="Copy script to clipboard"
1025|        >
1026|          Copy
1027|        </button>
1028|      </div>
1029|    </div>
1030|  );
1031|}
1032|
1033|type ReachResult = Awaited<ReturnType<typeof checkPublicReachability>>;
1034|type ReachState = ReturnType<typeof useMutation<ReachResult, Error, string | undefined>>;
1035|
1036|function ReachabilityPanel({ state, onRun }: { state: ReachState; onRun: () => void }) {
  const d = state.data;
  const isPending = state.isPending;
  
  return (
    <div className={`mt-6 relative overflow-hidden rounded-2xl border p-5 transition-all duration-500 ${
      isPending ? "border-primary/40 bg-primary/5" : 
      d?.ok ? "border-emerald-500/40 bg-emerald-500/10" : 
      d ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/10"
    }`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isPending && (
            <div className="relative flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex h-4 w-4 rounded-full bg-primary"></span>
            </div>
          )}
          <span className="text-sm font-bold uppercase tracking-wider">Public Reachability</span>
        </div>
        <button
          className="btn-ghost h-8 px-3 text-xs transition-all hover:bg-primary/20"
          type="button"
          onClick={onRun}
          disabled={isPending}
        >
          {isPending ? "Probing..." : d ? "Re-run" : "Run check"}
        </button>
      </div>
      
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          Verifying that your WAN address is reachable on port 443. This ensures the Cloud DDNS setup will work perfectly.
        </p>
        {d && (
          <ul className="grid grid-cols-1 gap-2 mt-3">
            {d.target && (
              <li className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Target: <code className="text-primary">{d.target}:{d.port ?? 443}</code>
              </li>
            )}
            {d.classification && (
              <li className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Network: <b className="text-foreground">{d.classification.kind}</b> — {d.classification.reason}
              </li>
            )}
            {d.ok && (
              <li className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                ✓ Securely reachable from Cloud
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
1118|
1119|// ============= Intro click-through tour =============
1120|type IntroSlide = {
1121|  eyebrow: string;
1122|  title: string;
1123|  body: string;
1124|  bullets?: string[];
1125|  tint: string;
1126|  icon: React.ReactNode;
1127|};
1128|
1129|const INTRO_SLIDES: IntroSlide[] = [
1130|  {
1131|    eyebrow: "Welcome",
1132|    title: "Let's connect your MikroTik",
1133|    body: "This wizard exposes RouterOS REST securely so this app can manage your hotspot from anywhere — no port-forwards to memorize, no manual certs.",
1134|    bullets: [
1135|      "Takes about 5 minutes end-to-end",
1136|      "Safe by default — a full backup runs before any change",
1137|      "You can roll back with one click at any time",
1138|    ],
1139|    tint: "radial-gradient(circle at 30% 30%, #22d3ee, #6366f1 60%, transparent)",
1140|    icon: (
1141|      <svg
1142|        viewBox="0 0 24 24"
1143|        fill="none"
1144|        stroke="currentColor"
1145|        strokeWidth="1.6"
1146|        strokeLinecap="round"
1147|        strokeLinejoin="round"
1148|      >
1149|        <path d="M15 4l1.2 2.8L19 8l-2.8 1.2L15 12l-1.2-2.8L11 8l2.8-1.2L15 4z" />
1150|        <path d="M4 20l9-9" />
1151|      </svg>
1152|    ),
1153|  },
1154|  {
1155|    eyebrow: "What you'll need",
1156|    title: "A laptop on the same LAN",
1157|    body: "You need Winbox (or WebFig) access to the router, plus admin credentials. Your laptop should be on the same LAN so we can auto-detect the DDNS name.",
1158|    bullets: [
1159|      "Router LAN IP (default 192.168.88.1)",
1160|      "An admin login for RouterOS",
1161|      "Cable or Wi-Fi to the same LAN as the router",
1162|      "A public hostname is required — otherwise use a local Connector instead",
1163|    ],
1164|    tint: "radial-gradient(circle at 30% 30%, #34d399, #0ea5e9 60%, transparent)",
1165|    icon: (
1166|      <svg
1167|        viewBox="0 0 24 24"
1168|        fill="none"
1169|        stroke="currentColor"
1170|        strokeWidth="1.6"
1171|        strokeLinecap="round"
1172|        strokeLinejoin="round"
1173|      >
1174|        <rect x="3" y="4" width="18" height="12" rx="2" />
1175|        <path d="M2 20h20" />
1176|      </svg>
1177|    ),
1178|  },
1179|  {
1180|    eyebrow: "How it works",
1181|    title: "Five guided steps",
1182|    body: "Every step has clear inputs, copy-paste snippets, and inline checks. You can jump back to any completed step at any time.",
1183|    bullets: [
1184|      "1 · Name + API credentials",
1185|      "2 · Open Winbox on the RouterBoard",
1186|      "3 · Run the generated setup script",
1187|      "4 · Register + reachability test",
1188|      "5 · Done — router is live in your fleet",
1189|    ],
1190|    tint: "radial-gradient(circle at 30% 30%, #f472b6, #a855f7 60%, transparent)",
1191|    icon: (
1192|      <svg
1193|        viewBox="0 0 24 24"
1194|        fill="none"
1195|        stroke="currentColor"
1196|        strokeWidth="1.6"
1197|        strokeLinecap="round"
1198|        strokeLinejoin="round"
1199|      >
1200|        <path d="M4 6h16M4 12h16M4 18h10" />
1201|      </svg>
1202|    ),
1203|  },
1204|  {
1205|    eyebrow: "Ready",
1206|    title: "You're set — let's go",
1207|    body: "If anything fails at Step 4, the failure card offers a one-click soft rollback (removes the API user + cert) or a hard restore from the pre-change backup. If the router simply can't be reached from the internet, use the Connectors tab and pair a local connector instead.",
1208|    tint: "radial-gradient(circle at 30% 30%, #fbbf24, #f97316 60%, transparent)",
1209|    icon: (
1210|      <svg
1211|        viewBox="0 0 24 24"
1212|        fill="none"
1213|        stroke="currentColor"
1214|        strokeWidth="1.6"
1215|        strokeLinecap="round"
1216|        strokeLinejoin="round"
1217|      >
1218|        <path d="M5 12l4 4 10-10" />
1219|      </svg>
1220|    ),
1221|  },
1222|];
1223|
1224|function IntroTour({
1225|  slide,
1226|  onNext,
1227|  onBack,
1228|  onStart,
1229|  onSkip,
1230|}: {
1231|  slide: number;
1232|  onNext: () => void;
1233|  onBack: () => void;
1234|  onStart: () => void;
1235|  onSkip: () => void;
1236|}) {
1237|  const s = INTRO_SLIDES[slide] ?? INTRO_SLIDES[0];
1238|  const isLast = slide >= INTRO_SLIDES.length - 1;
1239|  return (
1240|    <div
1241|      role="dialog"
1242|      aria-modal="true"
1243|      aria-label="Quick setup tour"
1244|      className="fixed inset-0 z-50 flex items-center justify-center p-4"
1245|    >
1246|      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" onClick={onSkip} />
1247|      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-3xl border border-white/20 bg-background/80 p-4 shadow-2xl backdrop-blur-2xl sm:p-6">
1248|        <div
1249|          className="absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-70"
1250|          style={{ background: s.tint, filter: "blur(30px)" }}
1251|          aria-hidden="true"
1252|        />
1253|        <div className="relative flex items-start gap-3 sm:gap-4">
1254|          <div
1255|            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 text-white shadow-lg sm:h-14 sm:w-14"
1256|            style={{
1257|              background:
1258|                "linear-gradient(140deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.12))",
1259|              backdropFilter: "blur(14px) saturate(160%)",
1260|            }}
1261|          >
1262|            <div className="h-6 w-6 sm:h-7 sm:w-7">{s.icon}</div>
1263|          </div>
1264|          <div className="min-w-0 flex-1">
1265|            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
1266|              {s.eyebrow}
1267|            </div>
1268|            <h2 className="mt-1 text-lg font-semibold sm:text-xl">{s.title}</h2>
1269|            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
1270|            {s.bullets && (
1271|              <ul className="mt-3 space-y-1.5 text-sm">
1272|                {s.bullets.map((b) => (
1273|                  <li key={b} className="flex items-start gap-2">
1274|                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
1275|                    <span>{b}</span>
1276|                  </li>
1277|                ))}
1278|              </ul>
1279|            )}
1280|          </div>
1281|        </div>
1282|
1283|        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 sm:mt-6">
1284|          <div className="flex items-center gap-1.5" aria-hidden="true">
1285|            {INTRO_SLIDES.map((_, i) => (
1286|              <span
1287|                key={i}
1288|                className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
1289|              />
1290|            ))}
1291|          </div>
1292|          <div className="ml-auto flex items-center gap-2">
1293|            <button
1294|              type="button"
1295|              onClick={onSkip}
1296|              className="rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
1297|            >
1298|              Skip
1299|            </button>
1300|            {slide > 0 && (
1301|              <button type="button" onClick={onBack} className="btn-ghost min-h-[40px]">
1302|                Back
1303|              </button>
1304|            )}
1305|            {isLast ? (
1306|              <button type="button" onClick={onStart} className="btn-primary min-h-[40px]">
1307|                Start setup
1308|              </button>
1309|            ) : (
1310|              <button type="button" onClick={onNext} className="btn-primary min-h-[40px]">
1311|                Next
1312|              </button>
1313|            )}
1314|          </div>
1315|        </div>
1316|      </div>
1317|    </div>
1318|  );
1319|      {step === 4 && (
        <Card title="Step 4 · Finalize Connection" badge="Critical">
          <Field label="Cloud DDNS Hostname" hint="Paste the Host value from the setup script terminal.">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative flex-1 min-w-0">
                <input
                  className="input w-full min-h-[44px] pl-10"
                  value={ddnsHost}
                  onChange={(e) => setDdnsHost(e.target.value.trim())}
                  placeholder="abc123xyz.sn.mynetname.net"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9 0 00-18 0 9 9 0 009 9 0 009 9z" /></svg>
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost w-full min-h-[44px] whitespace-nowrap sm:w-auto"
                onClick={() => detectMut.mutate()}
                disabled={detectMut.isPending || !ddnsHost.trim()}
              >
                {detectMut.isPending ? "Verifying..." : "Auto-Detect"}
              </button>
            </div>
          </Field>

          <ReachabilityPanel state={reachMut} onRun={() => reachMut.mutate(undefined)} />

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card/30 backdrop-blur-sm">
              <div className="text-sm">
                <div className="font-semibold">Connection Status</div>
                <div className="text-xs text-muted-foreground">Verify before creating the router record</div>
              </div>
              <button
                type="button"
                className={`btn-primary inline-flex w-full min-h-[44px] items-center justify-center gap-2 sm:w-auto transition-all ${
                  testConnMut.data?.ok ? "bg-emerald-600 hover:bg-emerald-500 border-emerald-400" : ""
                }`}
                onClick={() => testConnMut.mutate()}
                disabled={busy || !ddnsHost || !apiUser || !apiPassword}
              >
                {testConnMut.isPending && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {testConnMut.isPending ? "Testing..." : testConnMut.data?.ok ? "Ready to Register" : "Test Connection"}
              </button>
            </div>

            {testConnMut.data && (
              <div className="grid grid-cols-1 gap-2">
                {testConnMut.data.steps?.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-black/20 border border-white/5 text-xs transition-all">
                    <span className={
                      s.status === "ok" ? "text-emerald-400" : 
                      s.status === "fail" ? "text-destructive" : 
                      s.status === "warn" ? "text-amber-400" : "text-muted-foreground"
                    }>
                      {s.status === "ok" ? "✓" : s.status === "fail" ? "✕" : s.status === "warn" ? "!" : "·"}
                    </span>
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground/60 ml-auto">{s.detail ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-ghost w-full min-h-[44px] sm:w-auto" onClick={() => setStep(3)} disabled={busy}>Back</button>
            <button
              className="btn-primary inline-flex w-full min-h-[44px] items-center justify-center gap-2 sm:w-auto"
              onClick={() => registerMut.mutate()}
              disabled={busy || !testConnMut.data?.ok}
            >
              Register Router
            </button>
          </div>
        </Card>
      )}}) {
1237|  const s = INTRO_SLIDES[slide] ?? INTRO_SLIDES[0];
1238|  const isLast = slide >= INTRO_SLIDES.length - 1;
1239|  return (
1240|    <div
1241|      role="dialog"
1242|      aria-modal="true"
1243|      aria-label="Quick setup tour"
1244|      className="fixed inset-0 z-50 flex items-center justify-center p-4"
1245|    >
1246|      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" onClick={onSkip} />
1247|      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-3xl border border-white/20 bg-background/80 p-4 shadow-2xl backdrop-blur-2xl sm:p-6">
1248|        <div
1249|          className="absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-70"
1250|          style={{ background: s.tint, filter: "blur(30px)" }}
1251|          aria-hidden="true"
1252|        />
1253|        <div className="relative flex items-start gap-3 sm:gap-4">
1254|          <div
1255|            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 text-white shadow-lg sm:h-14 sm:w-14"
1256|            style={{
1257|              background:
1258|                "linear-gradient(140deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.12))",
1259|              backdropFilter: "blur(14px) saturate(160%)",
1260|            }}
1261|          >
1262|            <div className="h-6 w-6 sm:h-7 sm:w-7">{s.icon}</div>
1263|          </div>
1264|          <div className="min-w-0 flex-1">
1265|            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
1266|              {s.eyebrow}
1267|            </div>
1268|            <h2 className="mt-1 text-lg font-semibold sm:text-xl">{s.title}</h2>
1269|            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
1270|            {s.bullets && (
1271|              <ul className="mt-3 space-y-1.5 text-sm">
1272|                {s.bullets.map((b) => (
1273|                  <li key={b} className="flex items-start gap-2">
1274|                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
1275|                    <span>{b}</span>
1276|                  </li>
1277|                ))}
1278|              </ul>
1279|            )}
1280|          </div>
1281|        </div>
1282|
1283|        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 sm:mt-6">
1284|          <div className="flex items-center gap-1.5" aria-hidden="true">
1285|            {INTRO_SLIDES.map((_, i) => (
1286|              <span
1287|                key={i}
1288|                className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
1289|              />
1290|            ))}
1291|          </div>
1292|          <div className="ml-auto flex items-center gap-2">
1293|            <button
1294|              type="button"
1295|              onClick={onSkip}
1296|              className="rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
1297|            >
1298|              Skip
1299|            </button>
1300|            {slide > 0 && (
1301|              <button type="button" onClick={onBack} className="btn-ghost min-h-[40px]">
1302|                Back
1303|              </button>
1304|            )}
1305|            {isLast ? (
1306|              <button type="button" onClick={onStart} className="btn-primary min-h-[40px]">
1307|                Start setup
1308|              </button>
1309|            ) : (
1310|              <button type="button" onClick={onNext} className="btn-primary min-h-[40px]">
1311|                Next
1312|              </button>
1313|            )}
1314|          </div>
1315|        </div>
1316|      </div>
1317|    </div>
1318|  );
1319|}