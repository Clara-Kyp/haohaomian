// Keep the public reference-answer contract as {answer:string}, while validating structured sections.
export function hasCompleteSentenceEnd(value:string){
  const text=value.trim().replace(/\*{1,2}$/,'').trim()
  return /[。！？.!?](?:[”"’'」』）)】\]])?$/.test(text)
}
export const referenceResponseFormat={type:'json_schema',json_schema:{name:'interview_reference_answer',strict:true,schema:{type:'object',additionalProperties:false,properties:{sections:{type:'array',minItems:4,maxItems:6,items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},content:{type:'string'}},required:['title','content']}}},required:['sections']}}}
export function validateReferenceAnswer(value:unknown){
  const sections=(value as {sections?:unknown})?.sections
  if(!Array.isArray(sections)||sections.length<4||sections.length>6)throw new Error('模型返回的参考答案结构不完整，需要4至6个完整要点，请重新生成。')
  const answer=sections.map((section,index)=>{
    if(typeof section?.title!=='string'||!section.title.trim()||typeof section?.content!=='string'||section.content.trim().length<20||!hasCompleteSentenceEnd(section.content))throw new Error('模型返回的参考答案有未写完的要点，请重新生成；原有答案保留。')
    return `${index+1}. ${section.title.trim()}\n${section.content.trim()}`
  }).join('\n\n')
  return {answer}
}
