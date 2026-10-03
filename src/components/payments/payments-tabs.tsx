import { Tabs } from "@/components/layout/tabs";

/** Unternavigation des Bereichs Einzahlungen: die einzelnen Zahlungen und das laufende Konto. */
export function PaymentsTabs() {
  return (
    <Tabs
      label="Bereiche der Einzahlungen"
      items={[
        { href: "/einzahlungen", label: "Einzahlungen" },
        { href: "/einzahlungen/konto", label: "Abrechnungskonto" },
      ]}
    />
  );
}
