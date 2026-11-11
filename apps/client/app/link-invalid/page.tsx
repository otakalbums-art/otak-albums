import { LinkIcon } from "lucide-react";

export default function LinkInvalidPage() {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-card">
      <LinkIcon className="mx-auto mb-3 h-8 w-8 text-purple" />
      <h1 className="mb-2 text-lg font-bold">Посилання не діє</h1>
      <p className="text-sm text-ink-soft">
        Можливо, його скопійовано не повністю, або групу вже закрито. Зверніться до фотографа чи
        відповідальної особи групи за новим посиланням.
      </p>
    </div>
  );
}
