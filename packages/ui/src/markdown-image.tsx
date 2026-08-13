import { useEffect, useRef, useState } from "react";

// Lightbox chrome adapted from refs/pi-web/components/ImagePreview.tsx
// (MIT, agegr, 0877bff). i18n and next/img omitted; harness tokens/CSS.

export function MarkdownImage({ src, alt = "" }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) {
        dialog.close();
      }
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const closePreview = () => {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
    setOpen(false);
  };

  if (failed) {
    return (
      <span className="chat-markdown-image-fallback text-muted-foreground" data-testid="markdown-image-fallback">
        {alt || "Image unavailable"}
      </span>
    );
  }

  const label = alt.trim() || "Preview image";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="chat-markdown-image-trigger"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        data-testid="markdown-image"
      >
        <img
          className="chat-markdown-image"
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </button>
      {open ? (
        <dialog
          ref={dialogRef}
          className="chat-markdown-image-dialog"
          aria-label={label}
          data-testid="markdown-image-dialog"
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            closePreview();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            closePreview();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closePreview();
            }
          }}
        >
          <img className="chat-markdown-image-dialog-img" src={src} alt={alt} referrerPolicy="no-referrer" />
          <button
            ref={closeButtonRef}
            type="button"
            className="chat-markdown-image-dialog-close"
            onClick={closePreview}
            aria-label="Close"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </dialog>
      ) : null}
    </>
  );
}
