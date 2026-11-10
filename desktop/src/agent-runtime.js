/** Replaceable proposal provider. Runtime outputs never write the graph directly. */
export class AgentRuntime {
 async propose({intent,graph}) {void intent;void graph;throw Error('AgentRuntime.propose must be implemented');}
}
export class MockRuntime extends AgentRuntime {
 constructor(proposal){super();this.proposal=structuredClone(proposal);}
 async propose({intent,graph}){void intent;void graph;return structuredClone(this.proposal);}
}
