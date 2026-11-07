// Owner-reported schema, serialized as Pinecone's 2026-07 HTTP response.
// No real host, credentials, provider calls or student information.
export const documentIndexResponse={
  name:'pathway-vectors',host:'document-wire.svc.pinecone.io',
  status:{ready:true,state:'Ready'},deployment:{deployment_type:'managed',cloud:'aws',region:'us-east-1'},
  schema:{fields:{
    title:{type:'string',full_text_search:{language:'en',stemming:false,stop_words:false},store_text:true},
    chunk_text:{type:'string',full_text_search:{language:'en',stemming:false,stop_words:false},store_text:true,
      embed:{model:'text-embedding-3-small',dimension:1536,metric:'cosine',write_parameters:{truncate:'END',input_type:'passage'},read_parameters:{truncate:'END',input_type:'query'}}},
  }},
};
