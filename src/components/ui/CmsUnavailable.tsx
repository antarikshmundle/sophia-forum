import React from "react";

/** Shown in CMS backend mode when the published records can't be read; the built-in data is never substituted. */
export function CmsUnavailable({ what }: { what: string }) {
  return (
    <p role="status" className="font-body text-sm text-muted-foreground text-center py-16 px-4">
      {`${what} temporarily unavailable. Please try again later.`}
    </p>
  );
}
