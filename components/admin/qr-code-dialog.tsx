"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function QrCodePanel({ url, formName }: { url: string; formName: string }) {
  const [png, setPng] = useState<string>("");
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } }).then(setPng);
    QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" }).then(setSvg);
  }, [url]);

  const fileBase = formName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "form";

  function download(href: string, ext: string) {
    const a = document.createElement("a");
    a.href = href;
    a.download = `${fileBase}-qr.${ext}`;
    a.click();
  }

  function print() {
    const w = window.open("", "_blank", "noopener,noreferrer,width=600,height=800");
    if (!w || !png) return;
    const doc = w.document;
    doc.title = `${formName} — QR code`;
    const wrap = doc.createElement("div");
    wrap.style.cssText = "font-family:system-ui,sans-serif;text-align:center;padding:40px";
    const h = doc.createElement("h1");
    h.textContent = formName;
    h.style.cssText = "font-size:28px;margin:0 0 8px";
    const p = doc.createElement("p");
    p.textContent = "Scan to share your feedback";
    p.style.cssText = "color:#475569;margin:0 0 24px;font-size:18px";
    const img = doc.createElement("img");
    img.src = png;
    img.style.cssText = "width:360px;height:360px";
    const u = doc.createElement("p");
    u.textContent = url;
    u.style.cssText = "color:#64748b;font-size:13px;margin-top:16px;word-break:break-all";
    wrap.append(h, p, img, u);
    doc.body.appendChild(wrap);
    img.onload = () => w.print();
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto flex aspect-square w-full max-w-[260px] items-center justify-center rounded-xl border bg-white p-3">
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL
          <img src={png} alt={`QR code linking to ${formName}`} className="size-full" />
        ) : (
          <div className="size-full animate-pulse rounded bg-slate-100" />
        )}
      </div>
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label="Public link" onFocus={(e) => e.currentTarget.select()} />
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy link"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied");
          }}
        >
          <Copy />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" disabled={!png} onClick={() => download(png, "png")}>
          <Download /> PNG
        </Button>
        <Button variant="outline" size="sm" disabled={!svg} onClick={() => download(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, "svg")}>
          <Download /> SVG
        </Button>
        <Button variant="outline" size="sm" disabled={!png} onClick={print}>
          <Printer /> Print
        </Button>
      </div>
    </div>
  );
}

export function QrCodeDialog({ open, onOpenChange, url, formName }: { open: boolean; onOpenChange: (o: boolean) => void; url: string; formName: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription>Place this at reception so patients can open “{formName}” on their phone.</DialogDescription>
        </DialogHeader>
        {open && <QrCodePanel url={url} formName={formName} />}
      </DialogContent>
    </Dialog>
  );
}
