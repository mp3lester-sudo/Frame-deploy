"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { uploadAvatar } from "@/lib/actions/profile";

const MAX_BYTES = 5 * 1024 * 1024;

export function AvatarUpload({ name, initialAvatarUrl }: { name: string; initialAvatarUrl: string | null }) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > MAX_BYTES) {
      setError("Image must be under 5MB");
      e.target.value = "";
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    const formData = new FormData();
    formData.set("avatar", file);
    startTransition(async () => {
      try {
        const url = await uploadAvatar(formData);
        setAvatarUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setPreview(null);
        URL.revokeObjectURL(localPreview);
        e.target.value = "";
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={preview ?? avatarUrl} size={72} />
      <div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          isLoading={isPending}
          onClick={() => inputRef.current?.click()}
        >
          {avatarUrl ? "Change photo" : "Upload photo"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="mt-1 text-[11px] text-foreground-muted">JPEG, PNG, WebP, or GIF — up to 5MB.</p>
        {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
      </div>
    </div>
  );
}
