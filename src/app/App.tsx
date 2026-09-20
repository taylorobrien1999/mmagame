import { Routes, Route } from "react-router-dom";
import { AppShell } from "./AppShell";
import { Dashboard } from "../pages/Dashboard";
import { Roster, Events, Negotiations, Promotion, League, FreeAgents } from "../pages/Stubs";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/events" element={<Events />} />
        <Route path="/negotiations" element={<Negotiations />} />
        <Route path="/promotion" element={<Promotion />} />
        <Route path="/league" element={<League />} />
        <Route path="/league/free-agents" element={<FreeAgents />} />
      </Route>
    </Routes>
  );
}
