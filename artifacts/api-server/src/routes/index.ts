import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import statsRouter from "./stats";
import scraperRouter from "./scraper.js";
import adminRouter from "./admin.js";
import authRouter from "./auth.js";
import exportRouter from "./export.js";

const router: IRouter = Router();

router.use(authRouter);
router.use(adminRouter);
router.use(healthRouter);
router.use(projectsRouter);
router.use(statsRouter);
router.use(scraperRouter);
router.use(exportRouter);

export default router;
