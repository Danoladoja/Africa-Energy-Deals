import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import statsRouter from "./stats";
import scraperRouter from "./scraper.js";
import adminRouter from "./admin.js";
import authRouter from "./auth.js";
import exportRouter from "./export.js";
import nlqRouter from "./nlq.js";
import watchesRouter from "./watches.js";
import apiKeysRouter from "./api-keys.js";
import institutionalRouter from "./institutional.js";

const router: IRouter = Router();

router.use(authRouter);
router.use(adminRouter);
router.use(healthRouter);
router.use(projectsRouter);
router.use(statsRouter);
router.use(scraperRouter);
router.use(exportRouter);
router.use(nlqRouter);
router.use(watchesRouter);
router.use(apiKeysRouter);
router.use(institutionalRouter);

export default router;
