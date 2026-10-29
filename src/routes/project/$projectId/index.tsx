import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Calendar, DollarSign, ShieldCheck } from "lucide-react";

import { useProject } from "../../../hooks/project.hooks";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/project/$projectId/")({
  component: ProjectDetails,
});

function formatBudget(budget: number | null) {
  if (budget === null) {
    return "Budget not specified";
  }

  return `${budget.toLocaleString()} tMSTC`;
}

function formatDeadline(deadline: string | null) {
  if (!deadline) {
    return "No deadline set";
  }

  return new Date(deadline).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ProjectDetails() {
  const { projectId } = Route.useParams();
  const { data: project, isLoading, error } = useProject(projectId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Card className="border-destructive">
          <CardContent className="p-6 text-destructive">
            {error.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Project not found.</p>
            <Link
              to="/projects"
              className={buttonVariants({ variant: "outline", className: "mt-4" })}
            >
              Back to Projects
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            TrustLance
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/projects"
              className={buttonVariants({ variant: "ghost" })}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              All Projects
            </Link>
            <Link
              to="/auth/login"
              className={buttonVariants()}
            >
              Sign In to Apply
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-6 py-12 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {project.title}
              </h1>
              <Badge variant={project.status === "open" ? "default" : "secondary"}>
                {project.status.toUpperCase()}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Posted on {new Date(project.created_at).toLocaleDateString()}
            </p>
          </div>

          <Link
            to="/auth/login"
            className={buttonVariants({ size: "lg" })}
          >
            Apply Now
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Project Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {project.description}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <DollarSign className="h-4 w-4 text-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Budget</p>
                    <p className="font-semibold">{formatBudget(project.budget)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <Calendar className="h-4 w-4 text-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Deadline</p>
                    <p className="font-medium">{formatDeadline(project.deadline)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-muted">
                    <ShieldCheck className="h-4 w-4 text-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Escrow Status</p>
                    <p className="text-sm font-medium">
                      {project.escrow_address ? "Smart Contract Escrow" : "Pending Escrow"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}