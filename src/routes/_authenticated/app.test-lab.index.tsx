import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/test-lab/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/test-lab/real" });
  },
});
