import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

/**
 * Kleiner Seitenaufbau auf pdf-lib: fortlaufender Text, Überschriften und Tabellen mit
 * Zeilenumbruch, Seitenwechsel und wiederholter Kopfzeile. Bewusst ohne weitere Abhängigkeit –
 * pdf-lib ist reines JavaScript und läuft damit auch in einer Vercel Function.
 *
 * Verwendet werden die Standardschriften (Helvetica). Sie kennen nur den WinAnsi-Zeichensatz;
 * `clean` ersetzt alles andere, damit ein ungewöhnliches Zeichen in einer Beschreibung nicht
 * die ganze Abrechnung scheitern lässt.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = { x: 48, top: 52, bottom: 56 };

const COLOR = {
  text: rgb(0.1, 0.11, 0.13),
  muted: rgb(0.4, 0.42, 0.46),
  line: rgb(0.82, 0.84, 0.87),
  strongLine: rgb(0.35, 0.37, 0.41),
  band: rgb(0.95, 0.955, 0.965),
  accent: rgb(0.11, 0.31, 0.62),
};

const SIZE = { title: 20, heading: 12.5, body: 9, small: 7.5 };
const LINE = 1.32;
const CELL = { x: 5, y: 4 };

export interface TableColumn {
  header: string;
  /** Breite in Punkt; genau eine Spalte darf `null` sein und bekommt den Rest. */
  width: number | null;
  /** Rechtsbündige Spalten (Beträge) brechen nicht um. */
  align?: "left" | "right";
}

export interface TableCell {
  text: string;
  /** Kleinere zweite Zeile, z. B. Datum und Umlageschlüssel unter der Beschreibung. */
  sub?: string;
}

export interface TableRow {
  cells: (string | TableCell)[];
  /** group = Zwischenüberschrift, subtotal/total = Summenzeilen. */
  style?: "normal" | "group" | "subtotal" | "total";
}

interface TextOptions {
  size?: number;
  bold?: boolean;
  color?: RGB;
  /** Abstand nach dem Absatz. */
  gap?: number;
}

export class PdfLayout {
  private page!: PDFPage;
  /** Schreibposition: Abstand der nächsten Zeile von der Seitenunterkante. */
  private y = 0;
  private readonly supported: Set<number>;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly size: { width: number; height: number },
    private readonly footer: string,
  ) {
    this.supported = new Set(regular.getCharacterSet());
    this.addPage();
  }

  static async create(options: {
    title: string;
    footer: string;
    landscape?: boolean;
  }): Promise<PdfLayout> {
    const doc = await PDFDocument.create();
    doc.setTitle(options.title);
    doc.setAuthor("Betriebskostenabrechnung");
    doc.setCreator("Betriebskostenabrechnung");
    doc.setLanguage("de-AT");
    doc.setCreationDate(new Date());

    const [regular, bold] = [
      await doc.embedFont(StandardFonts.Helvetica),
      await doc.embedFont(StandardFonts.HelveticaBold),
    ];
    const size = options.landscape ? { width: A4.height, height: A4.width } : A4;
    return new PdfLayout(doc, regular, bold, size, options.footer);
  }

  /** Nutzbare Breite zwischen den Seitenrändern. */
  get contentWidth(): number {
    return this.size.width - 2 * MARGIN.x;
  }

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  /** Ersetzt Zeichen, die die Standardschrift nicht darstellen kann. */
  private clean(text: string): string {
    let result = "";
    for (const char of text.normalize("NFC")) {
      const code = char.codePointAt(0)!;
      if (code === 0x00a0 || code === 0x202f || code === 0x2009 || char === "\t") result += " ";
      else if (code === 0x2212) result += "-";
      else if (char === "\n" || char === "\r") result += " ";
      else result += this.supported.has(code) ? char : "?";
    }
    return result;
  }

  private width(text: string, font: PDFFont, size: number): number {
    return font.widthOfTextAtSize(text, size);
  }

  /** Bricht Text an Wortgrenzen um; überlange Wörter (Dateinamen) werden hart getrennt. */
  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = "";
    const push = () => {
      if (line) lines.push(line);
      line = "";
    };

    for (const word of this.clean(text).split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (this.width(candidate, font, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      push();
      // Ein überlanges Wort zuerst an Binde-, Unterstrich, Punkt oder Schrägstrich teilen …
      for (const piece of word.split(/(?<=[-_./])/)) {
        if (this.width(line + piece, font, size) <= maxWidth) {
          line += piece;
          continue;
        }
        push();
        // … und nur wenn selbst ein Teilstück nicht passt, mitten im Wort.
        let rest = piece;
        while (this.width(rest, font, size) > maxWidth && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && this.width(rest.slice(0, cut), font, size) > maxWidth) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    push();
    return lines.length > 0 ? lines : [""];
  }

  private addPage(): void {
    this.page = this.doc.addPage([this.size.width, this.size.height]);
    this.y = this.size.height - MARGIN.top;
  }

  /** Beginnt eine neue Seite, wenn `height` nicht mehr auf die aktuelle passt. */
  ensureSpace(height: number): boolean {
    if (this.y - height >= MARGIN.bottom) return false;
    this.addPage();
    return true;
  }

  gap(points: number): void {
    this.y -= points;
  }

  text(text: string, options: TextOptions = {}): void {
    const size = options.size ?? SIZE.body;
    const font = options.bold ? this.bold : this.regular;
    const lineHeight = size * LINE;
    for (const line of this.wrap(text, font, size, this.contentWidth)) {
      this.ensureSpace(lineHeight);
      this.page.drawText(line, {
        x: MARGIN.x,
        y: this.y - size,
        size,
        font,
        color: options.color ?? COLOR.text,
      });
      this.y -= lineHeight;
    }
    this.y -= options.gap ?? 0;
  }

  muted(text: string, options: Omit<TextOptions, "color"> = {}): void {
    this.text(text, { ...options, color: COLOR.muted });
  }

  title(text: string): void {
    this.text(text, { size: SIZE.title, bold: true, gap: 2 });
  }

  /** Abschnittsüberschrift mit Linie – bleibt mit dem Beginn des Abschnitts auf einer Seite. */
  heading(text: string): void {
    this.ensureSpace(SIZE.heading * LINE + 60);
    this.y -= 14;
    this.text(text, { size: SIZE.heading, bold: true, gap: 3 });
    this.page.drawLine({
      start: { x: MARGIN.x, y: this.y },
      end: { x: MARGIN.x + this.contentWidth, y: this.y },
      thickness: 1.2,
      color: COLOR.accent,
    });
    this.y -= 8;
  }

  /** Hervorgehobener Hinweis, z. B. „Entwurf“. */
  notice(title: string, text: string): void {
    const padding = 8;
    const inner = this.contentWidth - 2 * padding;
    const lines = this.wrap(text, this.regular, SIZE.body, inner);
    const height = 2 * padding + SIZE.body * LINE * (lines.length + 1);
    this.ensureSpace(height + 6);
    this.page.drawRectangle({
      x: MARGIN.x,
      y: this.y - height,
      width: this.contentWidth,
      height,
      color: COLOR.band,
      borderColor: COLOR.strongLine,
      borderWidth: 0.8,
    });
    let y = this.y - padding - SIZE.body;
    this.page.drawText(this.clean(title), {
      x: MARGIN.x + padding,
      y,
      size: SIZE.body,
      font: this.bold,
      color: COLOR.text,
    });
    for (const line of lines) {
      y -= SIZE.body * LINE;
      this.page.drawText(line, {
        x: MARGIN.x + padding,
        y,
        size: SIZE.body,
        font: this.regular,
        color: COLOR.text,
      });
    }
    this.y -= height + 10;
  }

  /** Beschriftete Werte nebeneinander, z. B. Kostenanteil · Einzahlungen · Ergebnis. */
  figures(items: { label: string; value: string; emphasis?: boolean }[]): void {
    const width = this.contentWidth / items.length;
    const height = 44;
    this.ensureSpace(height + 8);
    items.forEach((item, index) => {
      const x = MARGIN.x + index * width;
      this.page.drawRectangle({
        x: x + (index === 0 ? 0 : 3),
        y: this.y - height,
        width: width - (index === 0 ? 3 : index === items.length - 1 ? 3 : 6),
        height,
        color: item.emphasis ? COLOR.band : undefined,
        borderColor: item.emphasis ? COLOR.strongLine : COLOR.line,
        borderWidth: item.emphasis ? 1 : 0.8,
      });
      const left = x + (index === 0 ? 0 : 3) + 8;
      this.page.drawText(this.clean(item.label), {
        x: left,
        y: this.y - 15,
        size: SIZE.small,
        font: this.regular,
        color: COLOR.muted,
      });
      this.page.drawText(this.clean(item.value), {
        x: left,
        y: this.y - 33,
        size: 13,
        font: this.bold,
        color: COLOR.text,
      });
    });
    this.y -= height + 10;
  }

  // -------------------------------------------------------------------------
  // Tabelle
  // -------------------------------------------------------------------------

  table(columns: TableColumn[], rows: TableRow[]): void {
    const fixed = columns.reduce((sum, column) => sum + (column.width ?? 0), 0);
    const widths = columns.map((column) => column.width ?? Math.max(60, this.contentWidth - fixed));
    const left = widths.map((_, index) =>
      widths.slice(0, index).reduce((sum, value) => sum + value, MARGIN.x),
    );
    const total = widths.reduce((sum, value) => sum + value, 0);

    const drawHeader = () => {
      const height = SIZE.small * LINE + 2 * CELL.y;
      columns.forEach((column, index) => {
        const label = this.clean(column.header);
        const x =
          column.align === "right"
            ? left[index] + widths[index] - CELL.x - this.width(label, this.bold, SIZE.small)
            : left[index] + CELL.x;
        this.page.drawText(label, {
          x,
          y: this.y - CELL.y - SIZE.small,
          size: SIZE.small,
          font: this.bold,
          color: COLOR.muted,
        });
      });
      this.y -= height;
      this.rule(total, COLOR.strongLine, 0.8);
    };

    this.ensureSpace(60);
    drawHeader();

    // Zeilen vorab umbrechen – die höchste Zelle bestimmt die Zeilenhöhe.
    const layouts = rows.map((row) => {
      const style = row.style ?? "normal";
      const font = style === "normal" ? this.regular : this.bold;
      const cells = columns.map((column, index) => {
        const cell = row.cells[index] ?? "";
        const { text, sub } = typeof cell === "string" ? { text: cell, sub: undefined } : cell;
        const inner = widths[index] - 2 * CELL.x;
        return {
          lines: column.align === "right" ? [this.clean(text)] : this.wrap(text, font, SIZE.body, inner),
          sub: sub ? this.wrap(sub, this.regular, SIZE.small, inner) : [],
        };
      });
      const height =
        2 * CELL.y +
        Math.max(
          ...cells.map(
            (cell) => cell.lines.length * SIZE.body * LINE + cell.sub.length * SIZE.small * LINE,
          ),
        );
      return { style, font, cells, height };
    });

    layouts.forEach(({ style, font, cells, height }, position) => {
      // Eine Zwischenüberschrift bleibt bei ihrer ersten Zeile – nie allein am Seitenende.
      const next = style === "group" ? (layouts[position + 1]?.height ?? 0) : 0;
      if (this.ensureSpace(height + next)) drawHeader();

      if (style === "group") {
        this.page.drawRectangle({
          x: MARGIN.x,
          y: this.y - height,
          width: total,
          height,
          color: COLOR.band,
        });
      }
      if (style === "total") this.rule(total, COLOR.strongLine, 0.8);

      cells.forEach((cell, index) => {
        let y = this.y - CELL.y - SIZE.body;
        for (const line of cell.lines) {
          const x =
            columns[index].align === "right"
              ? left[index] + widths[index] - CELL.x - this.width(line, font, SIZE.body)
              : left[index] + CELL.x;
          this.page.drawText(line, { x, y, size: SIZE.body, font, color: COLOR.text });
          y -= SIZE.body * LINE;
        }
        y += SIZE.body - SIZE.small;
        for (const line of cell.sub) {
          this.page.drawText(line, {
            x: left[index] + CELL.x,
            y,
            size: SIZE.small,
            font: this.regular,
            color: COLOR.muted,
          });
          y -= SIZE.small * LINE;
        }
      });

      this.y -= height;
      if (style === "normal" || style === "subtotal") this.rule(total, COLOR.line, 0.5);
    });
    this.y -= 8;
  }

  private rule(width: number, color: RGB, thickness: number): void {
    this.page.drawLine({
      start: { x: MARGIN.x, y: this.y },
      end: { x: MARGIN.x + width, y: this.y },
      thickness,
      color,
    });
  }

  // -------------------------------------------------------------------------
  // Abschluss
  // -------------------------------------------------------------------------

  /** Setzt Fußzeile und Seitenzahlen auf jede Seite und liefert das fertige PDF. */
  async finish(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    const footer = this.clean(this.footer);
    pages.forEach((page, index) => {
      const y = MARGIN.bottom - 26;
      page.drawLine({
        start: { x: MARGIN.x, y: y + 12 },
        end: { x: MARGIN.x + this.contentWidth, y: y + 12 },
        thickness: 0.5,
        color: COLOR.line,
      });
      page.drawText(footer, {
        x: MARGIN.x,
        y,
        size: SIZE.small,
        font: this.regular,
        color: COLOR.muted,
      });
      const label = `Seite ${index + 1} von ${pages.length}`;
      page.drawText(label, {
        x: MARGIN.x + this.contentWidth - this.width(label, this.regular, SIZE.small),
        y,
        size: SIZE.small,
        font: this.regular,
        color: COLOR.muted,
      });
    });
    return this.doc.save();
  }
}
