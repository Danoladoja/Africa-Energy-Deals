import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(statsRouter);

export default router;
