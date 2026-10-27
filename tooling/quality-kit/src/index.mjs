// Public, portable API surface. No Atlas or Vercel dependencies.
export {validateConfig,loadConfig,pickSuite,authorizeTarget,authorizeSuite} from './config.mjs';
export {validateFields,getPath,stableFingerprint,timestampAgeSeconds} from './contracts.mjs';
export {extractCache} from './adapters.mjs';
export {probe} from './probe.mjs';
export {runSuite} from './runner.mjs';
export {summarize} from './metrics.mjs';
export {markdownReport,csvReport} from './report.mjs';
export {fakeFetcher} from './faults.mjs';

export {compareCampaigns,markdownComparison} from './comparison.mjs';
