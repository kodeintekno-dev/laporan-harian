import type { Report } from "../api";
import { formatTime } from "../format";

export function ReportView({ report }: { report: Report }) {
  return (
    <div>
      <ol className="task-list">
        {report.tasks.map((task, index) => (
          <li key={index}>{task}</li>
        ))}
      </ol>
      {report.note && <p className="muted">Catatan: {report.note}</p>}
      <p className="muted">
        {report.source === "admin" ? "Diisi Admin" : `Keluar pukul ${formatTime(report.submittedAt)} WIB`}
      </p>
    </div>
  );
}
