const { send, requireAdmin } = require("../lib/_utils");
module.exports=async function handler(req,res){if(!requireAdmin(req,res))return;send(res,200,{ok:true});};