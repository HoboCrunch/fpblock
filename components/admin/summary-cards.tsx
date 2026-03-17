type CardData = {
  label: string;
  value: number;
  color?: string;
};

export function SummaryCards({ cards }: { cards: CardData[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-gray-900 border border-gray-800 rounded-lg p-4"
        >
          <div className="text-sm text-gray-400">{card.label}</div>
          <div className={`text-2xl font-semibold mt-1 ${card.color || "text-white"}`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
