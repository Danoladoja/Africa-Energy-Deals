import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import statsRouter from "./stats";
import scraperRouter from "./scraper.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(statsRouter);
router.use(scraperRouter);

export default router;
