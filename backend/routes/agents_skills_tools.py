"""
API router for Agents, Skills, and Tools.

Defines HTTP routes for CRUD operations on custom tools, skills, and agent personas,
as well as testing and debugging sandbox runs for each component.
"""

import json
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Tool, Skill, Agent, SystemLog
from ..schemas import ToolCreate, ToolTestInput, SkillCreate, SkillTestInput, AgentCreate, AgentTestInput, SkillAssignment
from ..helpers import generate_agent_intro_text, run_tool_test, execute_actual_react_loop
from ..logging_config import logger

router = APIRouter()


# ─── Tools Endpoint ────────────────────────────────────────────────────────────

@router.get("/api/tools")
def get_tools(db: Session = Depends(get_db)):
    """Retrieve all custom tools."""
    tools = db.query(Tool).all()
    result = []
    for tool in tools:
        result.append({
            "id": tool.id,
            "name": tool.name,
            "description": tool.description,
            "type": tool.type,
            "code": tool.code,
            "parameters": json.loads(tool.parameters or "[]"),
            "is_enabled": tool.is_enabled,
            "created_at": tool.created_at
        })
    return result


@router.post("/api/tools")
def create_tool(tool: ToolCreate, db: Session = Depends(get_db)):
    """Register a new custom tool in the Tool Studio."""
    db_tool = Tool(
        name=tool.name,
        description=tool.description,
        type=tool.type or "python",
        code=tool.code,
        parameters=json.dumps(tool.parameters or []),
        is_enabled=tool.is_enabled if tool.is_enabled is not None else True,
        created_by=tool.created_by or "admin",
        updated_by=tool.updated_by or "admin"
    )
    try:
        db.add(db_tool)
        db.commit()
        db.refresh(db_tool)
        db.add(SystemLog(
            level="INFO",
            message=f"New tool registered in Tool Studio: {tool.name}"
        ))
        db.commit()
        return db_tool
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Tool registration failed: {e}")


@router.put("/api/tools/{tool_id}")
def update_tool(tool_id: int, tool: ToolCreate, db: Session = Depends(get_db)):
    """Update details of a custom tool."""
    db_tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not db_tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    db_tool.name = tool.name
    db_tool.description = tool.description
    db_tool.type = tool.type
    db_tool.code = tool.code
    db_tool.parameters = json.dumps(tool.parameters or [])
    if tool.is_enabled is not None:
        db_tool.is_enabled = tool.is_enabled
    if tool.updated_by:
        db_tool.updated_by = tool.updated_by
    try:
        db.commit()
        db.refresh(db_tool)
        return db_tool
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Tool update failed: {e}")


@router.delete("/api/tools/{tool_id}")
def delete_tool(tool_id: int, db: Session = Depends(get_db)):
    """Delete a custom tool."""
    db_tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not db_tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    try:
        db.delete(db_tool)
        db.commit()
        return {"status": "success", "message": "Tool deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Tool deletion failed: {e}")


@router.post("/api/tools/test")
def test_tool(req: ToolTestInput, db: Session = Depends(get_db)):
    """Test a custom tool with sandbox inputs to verify its execution."""
    return run_tool_test(req.code, req.type, req.inputs, db)


# ─── Skills Endpoint ───────────────────────────────────────────────────────────

@router.get("/api/skills")
def get_skills(db: Session = Depends(get_db)):
    """Retrieve all custom skills."""
    skills = db.query(Skill).all()
    result = []
    for skill in skills:
        result.append({
            "id": skill.id,
            "name": skill.name,
            "description": skill.description,
            "instruction": skill.instruction,
            "parameters": json.loads(skill.parameters or "[]"),
            "output_definition": skill.output_definition,
            "tools": json.loads(skill.tools or "[]"),
            "is_enabled": skill.is_enabled,
            "created_at": skill.created_at
        })
    return result


@router.post("/api/skills")
def create_skill(skill: SkillCreate, db: Session = Depends(get_db)):
    """Register a new custom skill in the Skill Studio."""
    db_skill = Skill(
        name=skill.name,
        description=skill.description,
        instruction=skill.instruction,
        parameters=json.dumps(skill.parameters or []),
        output_definition=skill.output_definition,
        tools=json.dumps(skill.tools or []),
        is_enabled=skill.is_enabled if skill.is_enabled is not None else True,
        created_by=skill.created_by or "admin",
        updated_by=skill.updated_by or "admin"
    )
    try:
        db.add(db_skill)
        db.commit()
        db.refresh(db_skill)
        db.add(SystemLog(
            level="INFO", 
            message=f"New skill registered in Skill Studio: {skill.name}",
            created_by=skill.created_by or "admin",
            updated_by=skill.updated_by or "admin"
        ))
        db.commit()
        return db_skill
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Skill creation failed: {e}")


@router.put("/api/skills/{skill_id}")
def update_skill(skill_id: int, skill: SkillCreate, db: Session = Depends(get_db)):
    """Update details of a custom skill."""
    db_skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not db_skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    db_skill.name = skill.name
    db_skill.description = skill.description
    db_skill.instruction = skill.instruction
    db_skill.parameters = json.dumps(skill.parameters or [])
    db_skill.output_definition = skill.output_definition
    db_skill.tools = json.dumps(skill.tools or [])
    if skill.is_enabled is not None:
        db_skill.is_enabled = skill.is_enabled
    if skill.updated_by:
        db_skill.updated_by = skill.updated_by
    try:
        db.commit()
        db.refresh(db_skill)
        return db_skill
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Skill update failed: {e}")


@router.delete("/api/skills/{skill_id}")
def delete_skill(skill_id: int, db: Session = Depends(get_db)):
    """Delete a custom skill."""
    db_skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not db_skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    try:
        db.delete(db_skill)
        db.commit()
        return {"status": "success", "message": "Skill deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Skill deletion failed: {e}")


@router.post("/api/skills/test")
def test_skill(req: SkillTestInput, db: Session = Depends(get_db)):
    """Test a custom skill using the ReAct reasoning sandbox."""
    try:
        system_instruction = "You are a Databricks AI Agent. Use the provided tools to fulfill the user's request. Explain your reasoning at each step."
        instructions = f"Skill Instructions:\n{req.instruction}"
        output = execute_actual_react_loop(
            instructions=system_instruction + "\n\n" + instructions,
            inputs=req.inputs,
            db=db,
            available_tool_names=req.tools if req.tools else None,
            history=req.history
        )
        return {"status": "success", "output": output}
    except Exception as e:
        return {"status": "error", "output": f"Execution failed: {e}"}


# ─── Agents Endpoint ───────────────────────────────────────────────────────────

@router.get("/api/agents")
def get_agents(db: Session = Depends(get_db)):
    """Retrieve all active agents."""
    agents = db.query(Agent).all()
    result = []
    for agent in agents:
        agent_dict = {
            "id": agent.id,
            "name": agent.name,
            "role": agent.role,
            "skills": json.loads(agent.skills or "[]"),
            "tools": json.loads(agent.tools or "[]"),
            "instructions": agent.instructions,
            "introduction": agent.introduction,
            "is_enabled": agent.is_enabled,
            "created_at": agent.created_at
        }
        result.append(agent_dict)
    return result


@router.post("/api/agents")
def create_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    """Register a new AI Agent persona and auto-synthesize its introduction."""
    generated_intro = generate_agent_intro_text(
        agent_name=agent.name,
        agent_role=agent.role,
        agent_instructions=agent.instructions or "",
        skill_names=agent.skills or [],
        db=db
    )
    db_agent = Agent(
        name=agent.name,
        role=agent.role,
        skills=json.dumps(agent.skills or []),
        tools=json.dumps(agent.tools or []),
        instructions=agent.instructions,
        introduction=generated_intro,
        is_enabled=agent.is_enabled if agent.is_enabled is not None else True,
        created_by=agent.created_by or "admin",
        updated_by=agent.updated_by or "admin"
    )
    try:
        db.add(db_agent)
        db.commit()
        db.refresh(db_agent)
        db.add(SystemLog(
            level="INFO",
            message=f"New agent registered in Agent Studio: {agent.name}"
        ))
        db.commit()
        return db_agent
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Agent registration failed: {e}")


@router.put("/api/agents/{agent_id}")
def update_agent(agent_id: int, agent: AgentCreate, db: Session = Depends(get_db)):
    """Update details of an agent and regenerate its introduction welcome text."""
    db_agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    generated_intro = generate_agent_intro_text(
        agent_name=agent.name,
        agent_role=agent.role,
        agent_instructions=agent.instructions or "",
        skill_names=agent.skills or [],
        db=db
    )
    db_agent.name = agent.name
    db_agent.role = agent.role
    db_agent.skills = json.dumps(agent.skills or [])
    db_agent.tools = json.dumps(agent.tools or [])
    db_agent.instructions = agent.instructions
    db_agent.introduction = generated_intro
    if agent.is_enabled is not None:
        db_agent.is_enabled = agent.is_enabled
    if agent.updated_by:
        db_agent.updated_by = agent.updated_by
    try:
        db.commit()
        db.refresh(db_agent)
        return db_agent
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Agent update failed: {e}")


@router.delete("/api/agents/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    """Delete an AI Agent."""
    db_agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    try:
        db.delete(db_agent)
        db.commit()
        return {"status": "success", "message": "Agent deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Agent deletion failed: {e}")


@router.post("/api/agents/{agent_id}/skills")
def assign_agent_skills(agent_id: int, payload: SkillAssignment, db: Session = Depends(get_db)):
    """Assign custom skills and tools to an agent."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    generated_intro = generate_agent_intro_text(
        agent_name=agent.name,
        agent_role=agent.role,
        agent_instructions=agent.instructions or "",
        skill_names=payload.skills or [],
        db=db
    )
    
    agent.skills = json.dumps(payload.skills)
    agent.introduction = generated_intro
    if payload.tools is not None:
        agent.tools = json.dumps(payload.tools)
    db.commit()
    db.refresh(agent)
    
    db.add(SystemLog(level="INFO", message=f"Skills/tools updated for agent {agent.name}."))
    db.commit()
    return {
        "id": agent.id, 
        "name": agent.name, 
        "skills": payload.skills, 
        "tools": json.loads(agent.tools or "[]"), 
        "introduction": agent.introduction
    }


@router.post("/api/agents/test")
def test_agent(req: AgentTestInput, db: Session = Depends(get_db)):
    """Execute a test sandbox query session against a specific Agent persona."""
    try:
        system_instruction = f"""You are an AI Agent. Name: {req.name}, Role: {req.role}.

CRITICAL BEHAVIOR RULES:
1. You must execute your instructions and skills step-by-step. Do NOT skip steps or jump straight to the final results.
2. Carefully inspect all your system instructions, agent instructions, and skill instructions for any parameter placeholders enclosed in double curly braces (e.g. `{{placeholder}}`) or single curly braces (e.g. `{placeholder}`), such as `{{analysis_schema}}` or `{{dataset_name}}`.
3. If any such parameter placeholder is NOT provided in your current inputs (or in the conversation history), you MUST NOT assume a value, make it up, or skip the step. Instead, you MUST immediately STOP and reply to the user, asking them to provide values for those specific missing parameters before you execute any tools or perform the task.
4. Only once the user provides these values (which will appear in the conversation history), you should proceed to execute the steps in sequence (e.g., fetch the raw API data, check if the table exists or create it, write the raw data, run profiling queries on the table, and write the profiling statistics into the target profile table)."""
        
        # Resolve skill specifications and compile inherited tools
        skills_details = ""
        inherited_tools = set()
        if req.skills:
            db_skills = db.query(Skill).filter(Skill.name.in_(req.skills)).all()
            for idx, sk in enumerate(db_skills):
                skills_details += f"\n- Skill {idx+1}: {sk.name}\n  Description: {sk.description or 'None'}\n  Instruction: {sk.instruction or 'None'}\n"
                if sk.tools:
                    try:
                        sk_tools = json.loads(sk.tools)
                        if isinstance(sk_tools, list):
                            for t in sk_tools:
                                inherited_tools.add(t)
                    except Exception:
                        pass
        
        instructions = f"System Instructions:\n{req.instructions}\n\nAssigned Skills Details:\n{skills_details or 'None'}"
        
        output = execute_actual_react_loop(
            instructions=system_instruction + "\n\n" + instructions,
            inputs=req.inputs,
            db=db,
            available_tool_names=list(inherited_tools) if inherited_tools else None,
            history=req.history
        )
        return {"status": "success", "output": output}
    except Exception as e:
        return {"status": "error", "output": f"Execution failed: {e}"}
