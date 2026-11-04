export const onRequestGet = () => Response.json({ok:true,service:'feed-doctor-mcp',readOnly:true,stateless:true},{headers:{'Cache-Control':'no-store'}});
