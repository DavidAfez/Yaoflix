import { ResetForm } from "./form";
import { Kinetic } from "@/components/kinetic";

export default async function Page(props: PageProps<"/reset/[token]">) {
  const { token } = await props.params;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-12 p-6">
      <h1 className="font-display text-6xl font-extrabold tracking-tighter"><Kinetic text="Nouveau." /></h1>
      <ResetForm token={token} />
    </main>
  );
}
