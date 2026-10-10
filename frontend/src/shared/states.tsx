import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Skeleton } from "./ui/skeleton";

export function LoadingState() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
}: {
  title?: string;
  message: string;
  /** For example a <RetryButton />. */
  action?: ReactNode;
}) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {action && <AlertAction>{action}</AlertAction>}
    </Alert>
  );
}
