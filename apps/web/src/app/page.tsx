import { codeToHtml } from "shiki";
import { EdgeWorkspace } from "@/components/edge-workspace";
import { workspaceFiles } from "@/lib/mock-data";

export default async function Home() {
  const highlightedEntries = await Promise.all(
    workspaceFiles.map(async (file) => [
      file.id,
      await codeToHtml(file.source, {
        lang: file.language,
        theme: "github-light-default",
      }),
    ]),
  );

  return <EdgeWorkspace files={workspaceFiles} highlightedFiles={Object.fromEntries(highlightedEntries)} />;
}
