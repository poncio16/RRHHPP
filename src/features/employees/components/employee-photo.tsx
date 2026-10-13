"use client";

import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { removeEmployeePhotoAction, setEmployeePhotoAction } from "../actions";

/** Lado mayor de la foto que se sube: alcanza para la ficha y pesa poco desde el celular. */
const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.85;

/**
 * Foto del legajo. Quien puede editar la toca para sacarla con la cámara del
 * celular o elegir una imagen; el resto solo la ve.
 */
export function EmployeePhoto({
  employeeId,
  name,
  initials,
  photoUrl,
  canChange,
}: {
  employeeId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  canChange: boolean;
}) {
  const avatar = <Avatar url={photoUrl} name={name} initials={initials} />;
  if (!canChange) return avatar;
  return <PhotoDialog employeeId={employeeId} name={name} initials={initials} photoUrl={photoUrl} avatar={avatar} />;
}

function Avatar({
  url,
  name,
  initials,
  className,
}: {
  url: string | null;
  name: string;
  initials: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = cn("bg-muted relative size-20 shrink-0 overflow-hidden rounded-full border sm:size-24", className);
  if (!url || failedUrl === url) {
    return (
      <div
        className={cn(box, "text-muted-foreground flex items-center justify-center text-2xl font-medium")}
        aria-hidden
      >
        {initials}
      </div>
    );
  }
  return (
    <div className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- la foto sale de una ruta con sesión, no del optimizador de imágenes */}
      <img src={url} alt={`Foto de ${name}`} className="size-full object-cover" onError={() => setFailedUrl(url)} />
    </div>
  );
}

function PhotoDialog({
  employeeId,
  name,
  initials,
  photoUrl,
  avatar,
}: {
  employeeId: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  avatar: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // La vista previa es una URL `data:`: sigue valiendo aunque la página quede
  // oculta al navegar (Next conserva el estado) y no hay que liberarla.
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [error, setError] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Cambia al cerrar: una imagen que termina de procesarse después se descarta. */
  const attempt = useRef(0);

  function reset() {
    attempt.current++;
    setPhoto(null);
    setError(undefined);
    setConfirmRemove(false);
    setReading(false);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const current = ++attempt.current;
    setError(undefined);
    setConfirmRemove(false);
    setReading(true);
    const blob = await shrink(file);
    const preview = blob ? await dataUrl(blob).catch(() => null) : null;
    if (current !== attempt.current) return;
    setReading(false);
    if (!blob || !preview) {
      setError("No se pudo leer la imagen. Probá con otra foto o con una imagen JPG o PNG.");
      return;
    }
    setPhoto({ blob, preview });
  }

  function save() {
    if (!photo) return;
    startTransition(async () => {
      const form = new FormData();
      form.set("file", photo.blob, "foto.jpg");
      const result = await setEmployeePhotoAction(employeeId, form);
      if (!result.ok) {
        setError(result.error.fieldErrors?.file?.[0] ?? result.error.message);
        return;
      }
      toast.success("Foto guardada");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeEmployeePhotoAction(employeeId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Foto quitada");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  const busy = pending || reading;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        if (!value) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="group focus-visible:ring-ring/50 relative shrink-0 rounded-full outline-none focus-visible:ring-[3px]"
          aria-label={photoUrl ? "Cambiar la foto" : "Cargar una foto"}
        >
          {avatar}
          <span className="bg-primary text-primary-foreground group-hover:bg-primary/90 border-background absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border-2">
            <Camera className="size-4" aria-hidden />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Foto del legajo</DialogTitle>
          <DialogDescription>Sacala con la cámara del celular o elegí una imagen JPG o PNG.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <Avatar
            url={photo?.preview ?? photoUrl}
            name={name}
            initials={initials}
            className="size-48 rounded-lg sm:size-48"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={busy} onClick={() => cameraInput.current?.click()}>
            <Camera /> Sacar foto
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            <ImagePlus /> Elegir imagen
          </Button>
        </div>
        {/* `capture` abre la cámara en el celular; en la computadora se comporta como elegir un archivo. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        {confirmRemove && (
          <p className="text-sm">
            ¿Quitar la foto del legajo? El archivo no se borra: queda registrado en la auditoría.
          </p>
        )}
        <DialogFooter>
          {photo ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setPhoto(null)}>
                Descartar
              </Button>
              <Button disabled={busy} onClick={save}>
                {pending ? "Guardando…" : "Guardar foto"}
              </Button>
            </>
          ) : confirmRemove ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmRemove(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" disabled={busy} onClick={remove}>
                {pending ? "Quitando…" : "Sí, quitar"}
              </Button>
            </>
          ) : (
            photoUrl && (
              <Button variant="outline" disabled={busy} onClick={() => setConfirmRemove(true)}>
                <Trash2 /> Quitar foto
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Achica la foto en el navegador (lado mayor de MAX_SIDE px, JPEG) para que
 * suba rápido desde el celular. Siempre se vuelve a dibujar: así se respeta
 * la orientación con que se sacó y se descartan los metadatos, como la
 * ubicación. Si el navegador no puede leer la imagen, devuelve null.
 */
async function shrink(file: File): Promise<Blob | null> {
  // Una imagen común respeta la orientación de la cámara en todos los navegadores actuales.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await toJpeg(img, img.naturalWidth, img.naturalHeight);
  } catch {
    // Se intenta de otra forma.
  } finally {
    URL.revokeObjectURL(url);
  }
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) return null;
  try {
    return await toJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

async function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  // Fondo blanco: un PNG con transparencia no queda negro en JPEG.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
