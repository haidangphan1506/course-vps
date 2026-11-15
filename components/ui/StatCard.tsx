import Card from "./Card";

export default function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <Card className="px-3.5 py-3">
      <b className="block text-xl">{value}</b>
      <span className="text-xs text-zinc-500">{label}</span>
    </Card>
  );
}
