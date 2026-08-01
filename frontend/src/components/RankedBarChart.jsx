import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const ACCENT = "#f97316";
const MUTED = "#7c8499";

function Tip({ active, payload, valueFormatter }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0].payload;
  return (
    <div className="rounded-lg border border-forge-700 bg-forge-900 px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 font-medium text-forge-100">{name}</p>
      <p className="text-forge-400">{valueFormatter ? valueFormatter(value) : value}</p>
    </div>
  );
}

export default function RankedBarChart({ data, height = 260, valueFormatter, highlightKey }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1d212b" horizontal={false} />
        <XAxis type="number" stroke={MUTED} fontSize={11} tickLine={false} axisLine={{ stroke: "#2a2f3c" }} />
        <YAxis
          type="category"
          dataKey="name"
          stroke={MUTED}
          fontSize={11}
          width={110}
          tickLine={false}
          axisLine={{ stroke: "#2a2f3c" }}
        />
        <Tooltip content={<Tip valueFormatter={valueFormatter} />} cursor={{ fill: "rgba(249,115,22,0.06)" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {data.map((entry, idx) => (
            <Cell key={`${entry.name}-${idx}`} fill={highlightKey && entry.name === highlightKey ? ACCENT : "#3a4152"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
