import { useEffect, useState } from "react";
import { apiJson } from "../api";

type Boot = {
  data: {
    phases: { code: string; name: string; level: number; smallPoints: number; bigPoints: number }[];
  };
};

export default function Faq() {
  const [phases, setPhases] = useState<Boot["data"]["phases"]>([]);
  useEffect(() => {
    apiJson<Boot>("/api/tournaments/WC26/bootstrap").then((r) =>
      setPhases(r.data.phases.filter((p) => p.level > 1))
    );
  }, []);

  return (
    <div className="page">
      <h1>FAQ</h1>

      <h3>Why I&apos;m not in the leaderboard?</h3>
      <p>Because you haven&apos;t submitted any prediction yet.</p>

      <h3>What do I need to make predictions?</h3>
      <p>Enter scores from 0 to 99 on the predictions page and save.</p>

      <h3>When is the deadline for entering scores?</h3>
      <p>Matches close automatically five minutes before kickoff.</p>

      <h3>Are penalties taken into consideration?</h3>
      <p>
        No — only 90 minutes plus overtime if applicable. Penalties do not count toward points. In
        knockout matches we may show the shootout in parentheses (e.g. 1–1 (4–2)) so you can see who
        advanced; that does not change how your prediction is scored.
      </p>

      <h3>How do I win points?</h3>
      <p>
        <strong>Win/Tie points:</strong> correct winner or draw without exact score.
      </p>
      <p>
        <strong>Exact score points:</strong> correct winner or draw <em>and</em> exact score.
      </p>
      <p>Each phase grants different points:</p>

      <table className="table">
        <thead>
          <tr>
            <th>Phase</th>
            <th>Win/Tie</th>
            <th>Exact</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Groups</td>
            <td>1</td>
            <td>3</td>
          </tr>
          {phases.map((p) => (
            <tr key={p.code}>
              <td>{p.name}</td>
              <td>{p.smallPoints}</td>
              <td>{p.bigPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>What happens if someone cheats?</h3>
      <p>Accounts may be disabled if abuse is detected.</p>
    </div>
  );
}
