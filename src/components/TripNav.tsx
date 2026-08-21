import Link from "next/link";

export default function TripNav({
  projectId,
  active,
}: {
  projectId: string;
  active: "itinerary" | "people" | "documents" | "settings";
}) {
  const tabs = [
    { key: "itinerary", label: "Itinerary", href: `/trips/${projectId}` },
    { key: "people", label: "People", href: `/trips/${projectId}/people` },
    { key: "documents", label: "Documents", href: `/trips/${projectId}/documents` },
    { key: "settings", label: "Settings", href: `/trips/${projectId}/settings` },
  ] as const;

  return (
    <nav className="tablist">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={`tab ${active === tab.key ? "on" : ""}`}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
