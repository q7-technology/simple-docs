import { Card } from "../ui/Card";
import { Chip } from "../ui/Chip";
import { SectionHeading } from "../ui/SectionHeading";

/** A screen that isn't built yet, saying so and which build step brings it
 * (the design's build steps), rather than pretending. */
export function Soon({ title, step, what }: { title: string; step: number; what: string }) {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeading accentText={title} />
      <Card className="max-w-panel p-8">
        <Chip tone="meta">Arrives in step {step}</Chip>
        <p className="mt-4 text-body text-space-gray">{what}</p>
      </Card>
    </div>
  );
}

export const SOON = {
  documents: {
    title: "Documents", step: 2,
    what: "Documents written from a template, with every version kept and any one restored, arrive in step 2. Writing them with AI follows in step 3.",
  },
  clients: {
    title: "Clients", step: 2,
    what: "Clients and their projects, each with the documents written for them, arrive in step 2. Bringing them in from monkiro follows in step 8.",
  },
  templates: {
    title: "Templates", step: 7,
    what: "Editing templates here, with a form builder, a test run and publishing, arrives in step 7. The first five starter templates come with documents in step 2.",
  },
  spend: {
    title: "Spend", step: 3,
    what: "What writing with AI costs this month against your budget, by model, template and person, arrives with it in step 3.",
  },
};
