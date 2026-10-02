import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { addUnitEconomicsCost, deleteUnitEconomicsCost, getUnitEconomics, saveUnitEconomicsAssumptions } from "./unitEconomicsService";
import { buildUnitEconomicsCsv, unitEconomicsAssumptionInputSchema, unitEconomicsCostInputSchema, unitEconomicsMonthSchema, unitEconomicsScenarioOverridesSchema } from "../shared/unitEconomics";
import { isAuthenticated } from "./tokenAuth";

function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (!user) return res.status(401).json({ message: "Authentication required" });
  if (user?.role !== "super_admin") return res.status(403).json({ message: "Superadmin access required" });
  next();
}
function reportQuery(req: Request) {
  const month = unitEconomicsMonthSchema.parse(req.query.month);
  const rawOverrides = req.query.scenarioOverrides;
  const scenarioOverrides = rawOverrides == null || rawOverrides === ""
    ? {}
    : unitEconomicsScenarioOverridesSchema.parse(JSON.parse(String(rawOverrides)));
  return { month, scenarioOverrides };
}

export function registerUnitEconomicsRoutes(app: Express) {
  app.get("/api/superadmin/unit-economics", isAuthenticated, requireSuperadmin, async (req, res) => {
    try { const { month, scenarioOverrides } = reportQuery(req); res.json(await getUnitEconomics(month, scenarioOverrides)); }
    catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return res.status(400).json({ message: "Invalid month or scenario assumptions" }); console.error(error); res.status(500).json({ message: "Unable to load unit economics" }); }
  });
  app.put("/api/superadmin/unit-economics/assumptions", isAuthenticated, requireSuperadmin, async (req, res) => {
    try { const input=unitEconomicsAssumptionInputSchema.parse(req.body); await saveUnitEconomicsAssumptions(input, (req.user as any).id); res.json(await getUnitEconomics(input.month)); }
    catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid assumptions", issues: error.issues }); console.error(error); res.status(500).json({ message: "Unable to save assumptions" }); }
  });
  app.post("/api/superadmin/unit-economics/costs", isAuthenticated, requireSuperadmin, async (req, res) => {
    try { const input=unitEconomicsCostInputSchema.parse(req.body); const cost=await addUnitEconomicsCost(input, (req.user as any).id); res.status(201).json(cost); }
    catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid cost", issues: error.issues }); console.error(error); res.status(500).json({ message: "Unable to save cost" }); }
  });
  app.delete("/api/superadmin/unit-economics/costs/:id", isAuthenticated, requireSuperadmin, async (req, res) => {
    try { const id=z.string().uuid().parse(req.params.id); await deleteUnitEconomicsCost(id); res.status(204).end(); }
    catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid cost id" }); console.error(error); res.status(500).json({ message: "Unable to delete cost" }); }
  });
  app.get("/api/superadmin/unit-economics/export.csv", isAuthenticated, requireSuperadmin, async (req, res) => {
    try {
      const { month, scenarioOverrides } = reportQuery(req); const report:any=await getUnitEconomics(month, scenarioOverrides);
      if (!report.foundationReady) return res.status(409).json(report);
      res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",`attachment; filename="cretexchange-unit-economics-${month}.csv"`);
      res.send(buildUnitEconomicsCsv(report));
    } catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return res.status(400).json({ message: "Invalid month or scenario assumptions" }); console.error(error); res.status(500).json({ message: "Unable to export report" }); }
  });
}
