import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/tenants")({
  beforeLoad: () => {
    throw redirect({ to: "/app/users", search: { view: "tenants" } });
  },
});
