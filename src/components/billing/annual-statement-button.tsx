"use client";

import { Download, ExternalLink, FileText, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Dialog } from "@/components/forms/dialog";
import { Field } from "@/components/forms/field";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

interface AnnualStatementButtonProps {
  /** Abrechnungsjahre, die der Benutzer sehen darf – neuestes zuerst. */
  years: { year: number; released: boolean }[];
  /** Vorauswahl, z. B. das Jahr der aktuellen Ansicht. */
  defaultYear?: number;
  /**
   * TOPs für die Abrechnung einer einzelnen TOP – nur für die Verwaltung. Ohne Einträge gibt
   * es keine Auswahl: der Server liefert dann ohnehin nur die eigene TOP.
   */
  units: { number: number; name: string }[];
}

const ALL = "alle";

function statementUrl(year: number, top: string, download = false): string {
  const query = new URLSearchParams({
    ...(top === ALL ? {} : { top }),
    ...(download ? { download: "1" } : {}),
  }).toString();
  return `/api/abrechnung/${year}/pdf${query ? `?${query}` : ""}`;
}

/**
 * „Jahresabrechnung erstellen“: Jahr (und für die Verwaltung den Umfang) wählen, das PDF
 * erzeugen, ansehen und herunterladen. Erzeugt wird es auf dem Server aus den freigegebenen
 * Daten – was der Benutzer nicht sehen darf, steht auch nicht im PDF.
 */
export function AnnualStatementButton({ years, defaultYear, units }: AnnualStatementButtonProps) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(
    years.find((entry) => entry.year === defaultYear)?.year ?? years[0]?.year,
  );
  const [top, setTop] = useState(ALL);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Vorschau als Blob-URL: so zeigt der Dialog einen Fehler als Meldung statt im Rahmen.
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  if (year === undefined) return null;
  const selected = years.find((entry) => entry.year === year);

  function reset() {
    setPreview(null);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function create() {
    if (year === undefined) return;
    reset();
    setPending(true);
    try {
      const response = await fetch(statementUrl(year, top));
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Die Jahresabrechnung konnte nicht erstellt werden.");
        return;
      }
      setPreview(URL.createObjectURL(await response.blob()));
    } catch {
      setError("Keine Verbindung zum Server. Bitte erneut versuchen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <FileText aria-hidden />
        Jahresabrechnung erstellen
      </Button>

      {open ? (
        <Dialog
          title="Jahresabrechnung erstellen"
          description="Als PDF zum Ansehen, Drucken und Herunterladen – mit allen freigegebenen Kosten und Einzahlungen."
          onClose={close}
          className={preview ? "max-w-4xl" : undefined}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Abrechnungsjahr" name="year">
                <Select
                  value={year}
                  onChange={(event) => {
                    setYear(Number(event.target.value));
                    reset();
                  }}
                >
                  {years.map((entry) => (
                    <option key={entry.year} value={entry.year}>
                      {entry.year}
                      {entry.released ? "" : " (Entwurf)"}
                    </option>
                  ))}
                </Select>
              </Field>
              {units.length > 0 ? (
                <Field label="Umfang" name="top">
                  <Select
                    value={top}
                    onChange={(event) => {
                      setTop(event.target.value);
                      reset();
                    }}
                  >
                    <option value={ALL}>Gesamtabrechnung aller TOPs</option>
                    {units.map((unit) => (
                      <option key={unit.number} value={unit.number}>
                        Nur {unit.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>

            {selected && !selected.released ? (
              <Alert tone="warning" title={`Die Abrechnung ${selected.year} ist noch nicht freigegeben`}>
                Das PDF wird als Entwurf gekennzeichnet. Enthalten sind auch hier nur freigegebene
                Kosten und Einzahlungen.
              </Alert>
            ) : null}
            {error ? <Alert tone="danger" title={error} /> : null}

            {preview ? (
              <>
                <Alert tone="success" title="Die Jahresabrechnung ist erstellt." />
                {/* Auf dem Handy zeigen Browser PDFs nicht eingebettet an – dort öffnet man sie im neuen Tab. */}
                <iframe
                  src={preview}
                  title={`Jahresabrechnung ${year}`}
                  className="hidden h-[60dvh] w-full rounded-lg border border-border sm:block"
                />
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="secondary" onClick={close} disabled={pending}>
              {preview ? "Schließen" : "Abbrechen"}
            </Button>
            {preview ? (
              <>
                <a
                  href={statementUrl(year, top)}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("secondary")}
                >
                  <ExternalLink aria-hidden />
                  In neuem Tab öffnen
                </a>
                <a href={statementUrl(year, top, true)} className={buttonClass("primary")}>
                  <Download aria-hidden />
                  Herunterladen
                </a>
              </>
            ) : (
              <Button onClick={create} disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <FileText aria-hidden />}
                PDF erstellen
              </Button>
            )}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
