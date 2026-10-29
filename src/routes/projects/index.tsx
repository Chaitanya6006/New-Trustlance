import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Blocks, Search } from "lucide-react";

import { useProjects } from "../../hooks/project.hooks";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/projects/")({
  component: PublicProjectsPage,
});

function formatBudget(budget: number | null) {
  if (budget === null) {
    return "Budget not specified";
  }

  return `${budget.toLocaleString()} tMSTC`;
}

function formatDeadline(deadline: string | null) {
  if (!deadline) {
    return "No deadline";
  }

  return new Date(deadline).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatusVariant(status: string) {
  switch (status) {
    case "open":
      return "default" as const;
    case "in_progress":
      return "secondary" as const;
    case "completed":
      return "outline" as const;
    case "cancelled":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "open":
      return "Open";
    case "draft":
      return "Draft";
    default:
      return status;
  }
}

function PublicProjectsPage() {
  const { data: projects, isLoading, error } = useProjects();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredProjects = useMemo(() => {
    if (!projects) {
      return [];
    }

    const normalizedSearch = search.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesSearch =
        !normalizedSearch ||
        project.title.toLowerCase().includes(normalizedSearch) ||
        project.description.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        statusFilter === "all" || project.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            TrustLance
          </Link>

          <div className="flex items-center gap-3">
            <Button variant="ghost">
              <Link to="/projects">Explore Projects</Link>
            </Button>

            <Button>
              <Link to="/auth/login">Get Started</Link>
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-6 py-12 space-y-8">
        <div>
          <Badge variant="secondary" className="mb-3">
            <Blocks className="mr-1.5 h-3.5 w-3.5" />
            MST Testnet Escrow
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Explore Open Projects
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Discover freelancing opportunities with milestone-locked escrows on
            MST Testnet (tMSTC).
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {/* Search & filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search projects..."
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["open", "Open"],
                  ["in_progress", "In progress"],
                  ["completed", "Completed"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={statusFilter === value ? "default" : "outline"}
                    onClick={() => setStatusFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project List */}
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index}>
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-3">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 font-semibold">No projects found</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Try adjusting your search query or status filter.
              </p>
              {(search || statusFilter !== "all") && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="h-full transition-colors hover:border-foreground/20 hover:bg-muted/20"
              >
                <CardContent className="flex h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-semibold leading-6 text-lg">
                      {project.title}
                    </h3>
                    <Badge variant={getStatusVariant(project.status)}>
                      {getStatusLabel(project.status)}
                    </Badge>
                  </div>

                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {project.description}
                  </p>

                  <div className="mt-auto grid grid-cols-2 gap-4 pt-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Budget</p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatBudget(project.budget)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Deadline</p>
                      <p className="mt-1 text-sm font-medium">
                        {formatDeadline(project.deadline)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t pt-4">
                    <span className="text-xs text-muted-foreground">
                      Posted{" "}
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>

                    <Link
                      to="/project/$projectId"
                      params={{ projectId: project.id }}
                      className={buttonVariants({ size: "sm" })}
                    >
                      View Details →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
