import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/test-lab/sandbox")({
  beforeLoad: () => {
    throw redirect({ to: "/app/test-lab/real" });
  },
});
