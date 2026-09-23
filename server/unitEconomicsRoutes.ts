import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { addUnitEconomicsCost, deleteUnitEconomicsCost, getUnitEconomics, saveUnitEconomicsAssumptions } from "./unitEconomicsService";
import { unitEconomicsAssumptionInputSchema, unitEconomicsCostInputSchema, unitEconomicsMonthSchema } from "../shared/unitEconomics";
import { isAuthenticated } from "./tokenAuth";

function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (!user) return res.status(401).json({ message: "Authentication required" });
  if (user?.role !== "super_admin") return res.status(403).json({ message: "Superadmin access required" });
  next();
}
function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

export function registerUnitEconomicsRoutes(app: Express) {
  app.get("/api/superadmin/unit-economics", isAuthenticated, requireSuperadmin, async (req, res) => {
    try { res.json(await getUnitEconomics(unitEconomicsMonthSchema.parse(req.query.month))); }
    catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ message: "Month must be YYYY-MM" }); console.error(error); res.status(500).json({ message: "Unable to load unit economics" }); }
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
      const month=unitEconomicsMonthSchema.parse(req.query.month); const report:any=await getUnitEconomics(month);
      if (!report.foundationReady) return res.status(409).json(report);
      const lines=[["CreteXchange Unit Economics",month],["Validated loads",report.metrics.validatedLoads],["Fee/load",report.metrics.feePerValidatedLoadCents/100],["Revenue",report.metrics.grossRevenueCents/100],["Provider costs",report.metrics.fixedCostsCents/100],["Processing costs",report.metrics.variableCostsCents/100],["Contribution profit",report.metrics.contributionProfitCents/100],["Break-even loads",report.metrics.breakEvenLoads],["Evidence provider",report.assumptions.evidenceStorageProvider],[],["Provider","Category","Monthly cost","Notes","Evidence/source"],...report.costs.map((c:any)=>[c.provider,c.category,c.amountCents/100,c.notes,c.sourceUrl])];
      res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",`attachment; filename="cretexchange-unit-economics-${month}.csv"`);
      res.send(lines.map((line:any[])=>line.map(csvCell).join(",")).join("\r\n"));
    } catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ message: "Month must be YYYY-MM" }); console.error(error); res.status(500).json({ message: "Unable to export report" }); }
  });
}
