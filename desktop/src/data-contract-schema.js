// Port semantics, independent of algorithm implementation or OpenCV bindings.
const text={type:'string',minLength:1};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export const coordinateFrameSchema={anyOf:[
 object({kind:{const:'input'},slot:text}),
 object({kind:{const:'reference'},slot:text}),
 object({kind:{const:'artifact'},nodeId:text,artifactId:text})
]};
export const coordinatesSchema=object({frame:coordinateFrameSchema,unit:{enum:['px','mm','m']}});
export const dataContractSchema={
 title:'AgentCV node data contract',
 description:'Explicit port meaning. Exact kind, frame and units must agree across an edge; no implicit conversion. Geometry JSON repeats coordinates; measurements contain value/unit; homography contains matrix/from/to. Contracts do not prove algorithm accuracy.',
 anyOf:[
  object({kind:{enum:['image','mask']},coordinates:coordinatesSchema}),
  object({kind:{enum:['points','contours','roi']},coordinates:coordinatesSchema}),
  object({kind:{const:'homography'},from:coordinatesSchema,to:coordinatesSchema}),
  object({kind:{const:'measurement'},unit:text}),
  object({kind:{const:'classification'},categories:{type:'array',items:text,minItems:1,uniqueItems:true}}),
  object({kind:{enum:['json','file']}})
 ]
};
