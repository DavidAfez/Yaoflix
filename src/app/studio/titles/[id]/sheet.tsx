"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload } from "lucide-react";
import { useT } from "@/components/i18n";
import { Editor, type Project } from "@/app/me/projects/projects";

export function SheetEditor({ value }: { value: Project }) {
  const t = useT();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  return (
    <div className="max-w-2xl">
      <Editor
        value={value}
        onClose={() => router.back()}
        onSaved={() => {
          setSaved(true);
          router.refresh();
        }}
      />
      {saved && (
        <div className="mt-6 flex flex-wrap items-center gap-4 border-l-2 border-lime bg-ink-2 p-4 text-sm">
          <Check size={16} className="text-lime" /> {t("Fiche enregistrée.")}
          <Link href={`/t/${value.kind}/${value.tmdbId}`} className="text-lime underline-offset-4 hover:underline">
            {t("Voir la page")}
          </Link>
          <Link href={`/studio/library?title=${value.id}`} className="notch ml-auto inline-flex h-10 items-center gap-2 bg-lime px-4 font-semibold text-ink">
            <Upload size={15} /> {t("Mettre en ligne")}
          </Link>
        </div>
      )}
    </div>
  );
}
