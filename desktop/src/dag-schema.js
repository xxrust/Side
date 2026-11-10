// JSON Schema (draft 2020-12 subset used by this project); graph invariants follow validation.
const nonempty={type:'object',minProperties:1};
export const proposalSchema={type:'object',required:['nodes','edges'],additionalProperties:false,properties:{
 nodes:{type:'array',items:{type:'object',additionalProperties:false,required:['id','kind','title','version','rationale','params','applicability'],properties:{
 id:{type:'string',pattern:'^[A-Za-z0-9_-]+$'},kind:{enum:['Locate','Offset','Defect']},title:{type:'string',pattern:'\\S'},version:{type:'integer',minimum:1},rationale:{type:'string',pattern:'\\S'},params:nonempty,applicability:nonempty}}},
 edges:{type:'array',items:{type:'object',additionalProperties:false,required:['id','from','to','kind','contract'],properties:{id:{type:'string',pattern:'^[A-Za-z0-9_-]+$'},from:{type:'string'},to:{type:'string'},kind:{enum:['requires','shares']},contract:nonempty}}}
}};
export function validateSchema(schema,value,path='$',errors=[]){
 const fail=message=>errors.push({path,message});
 if(schema.enum&&!schema.enum.includes(value))fail('must be one of '+schema.enum.join(', '));
 const type=Array.isArray(value)?'array':value===null?'null':typeof value;
 if(schema.type&&(schema.type==='integer'?!Number.isInteger(value):schema.type!==type)){fail('must be '+schema.type);return errors;}
 if(schema.pattern&&!new RegExp(schema.pattern).test(value))fail('must match '+schema.pattern);
 if(schema.minimum!==undefined&&value<schema.minimum)fail('below minimum');
 if(type==='object'){
  if(schema.minProperties&&Object.keys(value).length<schema.minProperties)fail('must not be empty');
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))errors.push({path:path+'.'+key,message:'required'});
  for(const [key,item] of Object.entries(value))if(schema.properties?.[key])validateSchema(schema.properties[key],item,path+'.'+key,errors);else if(schema.additionalProperties===false)errors.push({path:path+'.'+key,message:'unknown field'});
 }
 if(type==='array'&&schema.items)value.forEach((v,i)=>validateSchema(schema.items,v,`${path}[${i}]`,errors));
 return errors;
}
