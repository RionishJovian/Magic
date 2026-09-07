# Local Ruijie/Reyee capability lab

This directory contains a generic local test double, not a Ruijie protocol
implementation and not a production adapter. It models only redirect,
authorization, disconnect, duplicate-request, reachable, and unreachable
states needed to validate the vendor-neutral architecture.

Run directly with fake-only environment:

```sh
env -i PATH="$PATH" LAB_PORT=18080 LAB_GATEWAY_MODE=reachable \
  node tools/ruijie-lab/fake-gateway.mjs
```

The process refuses to start if production credential variable names are set.
The service binds to localhost when used through the Compose override and has
no outbound network client.

This double does not prove any RG-EG310GH-P-E capability. Device evidence must
come from the exact model and recorded ReyeeOS firmware in an isolated lab.
