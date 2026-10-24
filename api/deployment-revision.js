/* Exposes only a public deployment commit ID for reliable readiness checks. */
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 const sha=process.env.VERCEL_GIT_COMMIT_SHA||null;
 if(!sha)return res.status(503).json({error:'Vercel system commit environment variable unavailable'});
 return res.status(200).json({sha});
}
