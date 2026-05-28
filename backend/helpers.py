"""
Helper functions and utilities for the AgenticDataWorkspace backend.

This module houses LLM prompt synthesis logic for agent introductions,
workflow pipeline descriptions, and data obfuscation functions.
"""

import os
import json
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from .db.models import DataProduct, DataProject, Skill, Agent
from .agents.graph import call_llm
from .logging_config import logger


def generate_agent_intro_text(agent_name: str, agent_role: str, agent_instructions: str, skill_names: List[str], db: Session) -> str:
    """
    Generates a welcome introduction for an agent using LLM generation, falling back
    to a template if LLM query fails or is not configured.

    Args:
        agent_name (str): Name of the agent.
        agent_role (str): Role description of the agent.
        agent_instructions (str): System instruction prompt of the agent.
        skill_names (List[str]): List of assigned skill names.
        db (Session): Database session.

    Returns:
        str: Generated markdown text introduction.
    """
    skills_info = []
    if skill_names:
        db_skills = db.query(Skill).filter(Skill.name.in_(skill_names)).all()
        for sk in db_skills:
            skills_info.append({
                "name": sk.name,
                "description": sk.description,
                "instruction": sk.instruction
            })
            
    skills_and_tools_details = ""
    for idx, sk in enumerate(skills_info):
        skills_and_tools_details += f"- Skill {idx+1}: {sk['name']}\n  Description: {sk['description'] or 'None'}\n  Instruction: {sk['instruction'] or 'None'}\n"
        
    prompt = f"""You are an expert agent architect. Please read the following agent specification and generate a premium, friendly, professional, and clear introduction that the agent will use to welcome users in a test sandbox chat interface.

Agent Details:
- Name: {agent_name}
- Role: {agent_role}
- Instructions: {agent_instructions}

Assigned Skills and Tools:
{skills_and_tools_details}

Please write a cohesive introduction (1-2 short paragraphs) that:
1. Greets the user professionally.
2. Explains the agent's role and purpose in simple, clean language.
3. Summarizes the key skills it has access to and how they will be used.
4. Tells the user they can test the agent in this sandbox.
5. Asks 2-3 highly relevant, interactive follow-up questions or suggests sample queries/tasks (formatted as clean markdown bullet points at the end) to prompt the user to start testing the agent's specific capabilities.

Return ONLY the introduction markdown text. Keep it clean and concise, avoiding generic boilerplate placeholders. Do NOT include markdown tags around the response like ```markdown."""

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            intro = call_llm(prompt, system_instruction="You are a helpful AI assistant that generates agent introduction text.")
            if intro and len(intro.strip()) > 10:
                return intro.strip()
        except Exception as e:
            logger.error(f"Failed to generate agent introduction using LLM: {e}")
            
    # Fallback template-based generation if LLM is unavailable or fails
    intro = f"Hello! I am **{agent_name}**, your **{agent_role}**.\n\n"
    if agent_instructions:
        clean_instr = agent_instructions.replace("## INSTRUCTION OUTPUTS\n", "").replace("## GUARDRAILS\n", "")
        preview = clean_instr.split("\n")[0]
        intro += f"My primary focus is: {preview}\n\n"
    if skill_names:
        skills_str = ", ".join([f"**{s}**" for s in skill_names])
        intro += f"I have been equipped with the following capabilities: {skills_str}.\n"
        for sk in skills_info:
            desc_preview = sk['description'] or sk['instruction']
            if desc_preview:
                intro += f"- *{sk['name']}*: {desc_preview}\n"
        intro += "\n"
    intro += "Feel free to test my capabilities or trigger workflows in this sandbox!\n\n"
    intro += "Here are some questions you can ask me to get started:\n"
    if skill_names:
        for s in skill_names:
            s_lower = s.lower()
            if "fetch" in s_lower or "extract" in s_lower:
                intro += f"- \"Can you retrieve data using the {s} skill?\"\n"
            elif "analyze" in s_lower or "profile" in s_lower:
                intro += f"- \"How would you analyze the schema of our source dataset?\"\n"
            elif "ddl" in s_lower or "schema" in s_lower:
                intro += f"- \"Can you generate the DDL script for our Silver layer?\"\n"
            elif "dml" in s_lower or "transform" in s_lower:
                intro += f"- \"Can you generate the Delta MERGE transformation DML?\"\n"
            else:
                intro += f"- \"How do we utilize the {s} capability?\"\n"
    else:
        intro += "- \"What are the main requirements we need to gather for this integration?\"\n"
        intro += "- \"Can you draft the project scope and data objectives?\"\n"
    return intro


def generate_workflow_description(workflow_name: str, product_id: int, project_id: int, agents_sequence: list, db: Session) -> str:
    """
    Generates a descriptive summary for a multi-agent workflow using an LLM.

    Args:
        workflow_name (str): The name of the workflow.
        product_id (int): ID of the target data product.
        project_id (int): ID of the target data project.
        agents_sequence (list): Sequence of agent names.
        db (Session): Database session.

    Returns:
        str: Generated text description of the workflow.
    """
    # Get product
    prod_name = f"Product ID {product_id}"
    prod = db.query(DataProduct).filter(DataProduct.id == product_id).first()
    if prod:
        prod_name = prod.name
        
    # Get project
    proj_name = f"Project ID {project_id}"
    proj = db.query(DataProject).filter(DataProject.id == project_id).first()
    if proj:
        proj_name = proj.name

    # Get agents details
    agents_info = []
    if agents_sequence:
        db_agents = db.query(Agent).filter(Agent.name.in_(agents_sequence)).all()
        # Maintain order
        agent_dict = {a.name: a for a in db_agents}
        for name in agents_sequence:
            ag = agent_dict.get(name)
            if ag:
                agents_info.append({
                    "name": ag.name,
                    "role": ag.role,
                    "description": ag.instructions or "None"
                })

    sequence_details = ""
    for idx, ag in enumerate(agents_info):
        sequence_details += f"- Step {idx+1}: {ag['name']} (Role: {ag['role']}, Description: {ag['description']})\n"

    prompt = f"""You are an expert enterprise orchestration architect. Please read the following specification of a multi-agent data workflow and generate a high-quality, professional, and cohesive description (1-2 short sentences) detailing the purpose and flow of this orchestration sequence. Do not include markdown code block syntax.

Workflow Name: {workflow_name}
Target Data Product: {prod_name}
Target Project/Workspace: {proj_name}

Pipeline Agent Sequence:
{sequence_details}

Please write a clean, premium, and concise description summarizing the core data operations this sequence performs.
Return ONLY the description text. Keep it clean and concise. Do NOT include markdown tags around the response like ```markdown."""

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            desc = call_llm(prompt, system_instruction="You are a helpful AI assistant that generates database workflow descriptions.")
            if desc and len(desc.strip()) > 10:
                return desc.strip()
        except Exception as e:
            logger.error(f"Failed to generate workflow description using LLM: {e}")

    # Fallback template-based description
    seq_str = " -> ".join(agents_sequence) if agents_sequence else "No agents"
    return f"Orchestrates a data pipeline mapping to target product '{prod_name}' on project workspace '{proj_name}' using agent sequence: {seq_str}."


def mask_secret(val: Optional[str]) -> str:
    """
    Masks a sensitive credential or secret key for front-end rendering.

    Args:
        val (Optional[str]): The plain-text key value.

    Returns:
        str: The masked representation (e.g. AIzaSy...6loE).
    """
    if not val:
        return ""
    val_str = str(val).strip()
    if len(val_str) <= 8:
        return "****"
    return f"{val_str[:6]}...{val_str[-4:]}"


def run_tool_test(code: str, tool_type: str, inputs: dict, db: Session) -> dict:
    """
    Executes a custom tool (Python, SQL, or HTTP API) against sandbox inputs.

    Args:
        code (str): The code or query to execute.
        tool_type (str): The tool type ('python', 'sql', or 'api').
        inputs (dict): Input parameters.
        db (Session): Database session.

    Returns:
        dict: Result metadata, output logs, variables, or traceback.
    """
    import sys
    import io
    import traceback
    import requests
    from sqlalchemy import text
    import datetime

    tool_type_lower = tool_type.lower()
    if tool_type_lower == "python":
        class DualStream:
            def __init__(self, s1, s2, logger_func):
                self.s1 = s1
                self.s2 = s2
                self.logger_func = logger_func
                self.buffer = ""
            def write(self, data):
                self.s1.write(data)
                self.s2.write(data)
                self.buffer += data
                while "\n" in self.buffer:
                    line, self.buffer = self.buffer.split("\n", 1)
                    if line.strip():
                        self.logger_func(line)
            def flush(self):
                try: self.s1.flush()
                except: pass
                try: self.s2.flush()
                except: pass
                if self.buffer.strip():
                    self.logger_func(self.buffer)
                    self.buffer = ""

        old_stdout = sys.stdout
        new_stdout = io.StringIO()
        sys.stdout = DualStream(old_stdout, new_stdout, logger.info)
        try:
            local_env = {
                **inputs, 
                "inputs": inputs,
                "json": json,
                "os": os,
                "sys": sys,
                "requests": requests
            }
            exec(code, local_env, local_env)
            output = new_stdout.getvalue()
            # extract serializable local variables that were modified/created
            serializable_vars = {}
            for k, v in local_env.items():
                if k.startswith('_'):
                    continue
                try:
                    json.dumps(v)
                    serializable_vars[k] = v
                except Exception:
                    serializable_vars[k] = str(v)
            return {
                "status": "success",
                "output": output or "Python script completed successfully (no print output).",
                "variables": serializable_vars
            }
        except Exception as e:
            return {
                "status": "error",
                "output": new_stdout.getvalue(),
                "traceback": traceback.format_exc()
            }
        finally:
            sys.stdout = old_stdout

    elif tool_type_lower == "sql":
        sql_query = code
        for k, v in inputs.items():
            sql_query = sql_query.replace(f"{{{k}}}", str(v))
        try:
            res = db.execute(text(sql_query))
            if res.returns_rows:
                rows = []
                for row in res.fetchall()[:100]:
                    try:
                        r_dict = dict(row)
                    except (TypeError, ValueError):
                        r_dict = dict(row._mapping) if hasattr(row, '_mapping') else {}
                    rows.append(r_dict)
                for row in rows:
                    for k, v in row.items():
                        if isinstance(v, (datetime.datetime, datetime.date)):
                            row[k] = v.isoformat()
                return {
                    "status": "success",
                    "output": f"Executed SQL successfully. Returned {len(rows)} rows.",
                    "variables": {"rows": rows}
                }
            else:
                db.commit()
                return {
                    "status": "success",
                    "output": "Executed SQL command successfully (no rows returned).",
                    "variables": {"rowcount": res.rowcount}
                }
        except Exception as e:
            return {
                "status": "error",
                "output": str(e),
                "traceback": traceback.format_exc()
            }

    elif tool_type_lower == "api":
        url = code.strip()
        params = {}
        for k, v in inputs.items():
            if f"{{{k}}}" in url:
                url = url.replace(f"{{{k}}}", str(v))
            else:
                params[k] = v
        try:
            response = requests.get(url, params=params, timeout=5)
            return {
                "status": "success",
                "output": f"HTTP GET Request Successful.\nStatus Code: {response.status_code}\n\nResponse Content:\n{response.text[:1000]}",
                "variables": {
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "content": response.text[:2000]
                }
            }
        except Exception as e:
            return {
                "status": "error",
                "output": f"HTTP GET Request Failed: {e}",
                "traceback": traceback.format_exc()
            }
    else:
        return {
            "status": "error",
            "output": f"Unknown tool type: {tool_type}"
        }


def execute_actual_react_loop(
    instructions: str,
    inputs: dict,
    db: Session,
    model_name: str = "gemini-2.5-flash",
    available_tool_names: list = None,
    history: list = None,
    llm_provider: str = "gemini",
    experiment_id: str = None,
    endpoint_name: str = None
) -> str:
    """
    Executes a ReAct coordinator loop querying Gemini or Databricks Serving Endpoints.
    Automatically discovers and binds custom active Tools.

    Args:
        instructions (str): The prompt instructions for the execution context.
        inputs (dict): Payload inputs.
        db (Session): Database session.
        model_name (str): Gemini model identifier.
        available_tool_names (list): List of allowed tools to restrict execution.
        history (list): Conversation chat history.
        llm_provider (str): Provider to use ('gemini', 'databricks', etc.).
        experiment_id (str): MLflow tracking configuration experiment ID.
        endpoint_name (str): Serving endpoint identifier.

    Returns:
        str: Accumulated markdown log trace of the reasoning execution loop.
    """
    import google.genai as genai
    from google.genai import types
    import re
    import json
    import os
    import requests
    import datetime
    from .db.models import Tool

    # Enforce behavior guidelines
    behavior_guidelines = """

CRITICAL BEHAVIOR GUIDELINES FOR THE AGENT:
1. You must execute your instructions and skills step-by-step in a sequential order. Do NOT skip any steps or jump straight to the final outputs.
2. Check if your instructions or assigned skills contain any parameter placeholders (e.g. `{{placeholder_name}}` or `{placeholder_name}`).
3. If any such placeholder is not provided in your inputs or previous conversation context, you MUST immediately STOP and tell the user that you are missing the required parameters (list them explicitly) and ask the user to provide them. Do NOT make up or assume values for missing parameters.
4. Only when all parameters are provided, proceed with executing the steps using the provided tools (e.g. calling sync tools to extract data, query tools to write/read tables, and profile tools to generate statistics)."""
    
    instructions = instructions + behavior_guidelines

    query = db.query(Tool).filter(Tool.is_enabled == True)
    if available_tool_names:
        query = query.filter(Tool.name.in_(available_tool_names))
    active_tools = query.all()
    
    tool_declarations = []
    openai_tools = []
    tool_map = {}
    
    for t in active_tools:
        properties = {}
        required = []
        try:
            params = json.loads(t.parameters)
            for p in params:
                p_name = p.get('name')
                p_type = p.get('type')
                t_type = types.Type.STRING
                openai_type = "string"
                if p_type in ('integer', 'number'):
                    t_type = types.Type.INTEGER
                    openai_type = "integer"
                elif p_type == 'boolean':
                    t_type = types.Type.BOOLEAN
                    openai_type = "boolean"
                
                properties[p_name] = types.Schema(type=t_type, description=p.get('description', ''))
                if p.get('required'): required.append(p_name)
        except Exception:
            pass
            
        func_name = re.sub(r'[^a-zA-Z0-9_]', '_', t.name)
        if not re.match(r'^[a-zA-Z_]', func_name):
            func_name = 'tool_' + func_name
            
        tool_map[func_name] = t
        
        func_decl = types.FunctionDeclaration(
            name=func_name,
            description=t.description or f"Executes {t.name}",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties=properties,
                required=required
            ) if properties else None
        )
        tool_declarations.append(func_decl)

        openai_tools.append({
            "type": "function",
            "function": {
                "name": func_name,
                "description": t.description or f"Executes {t.name}",
                "parameters": {
                    "type": "object",
                    "properties": {k: {"type": "string" if v.type == types.Type.STRING else "integer" if v.type == types.Type.INTEGER else "boolean", "description": v.description} for k, v in properties.items()},
                    "required": required
                } if properties else {"type": "object", "properties": {}}
            }
        })
        
    gemini_tools = [types.Tool(function_declarations=tool_declarations)] if tool_declarations else None
    
    env_provider = os.getenv("LLM_PROVIDER")
    if env_provider:
        llm_provider = env_provider
    experiment_id = os.getenv("DATABRICKS_LLM_EXPERIMENT_ID") or experiment_id
    endpoint_name = os.getenv("DATABRICKS_LLM_ENDPOINT_NAME") or endpoint_name

    if llm_provider in ["databricks", "azure_openai", "azure_ai_foundry"]:
        host = ""
        token = ""
        url = ""
        headers = {}
        actual_endpoint = ""
        
        if llm_provider == "databricks":
            host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
            token = os.environ.get("DATABRICKS_TOKEN")
            actual_endpoint = endpoint_name or "databricks-meta-llama-3-1-70b-instruct"
            url = f"{host}/api/2.0/serving-endpoints/{actual_endpoint}/invocations"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        elif llm_provider == "azure_openai":
            token = os.environ.get("AZURE_OPENAI_API_KEY")
            host = os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
            actual_endpoint = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
            url = f"{host}/openai/deployments/{actual_endpoint}/chat/completions?api-version=2023-05-15"
            headers = {
                "api-key": token,
                "Content-Type": "application/json"
            }
        elif llm_provider == "azure_ai_foundry":
            token = os.environ.get("AZURE_FOUNDRY_API_KEY")
            host = os.environ.get("AZURE_FOUNDRY_ENDPOINT", "").rstrip("/")
            url = f"{host}/chat/completions"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            actual_endpoint = "azure-ai-foundry"
            
        if not url or (llm_provider == "databricks" and (not host or not token)) or (llm_provider in ["azure_openai", "azure_ai_foundry"] and (not host or not token)):
            trace = []
            trace.append(f"### [{llm_provider.upper()} RUNTIME - REACT LOOP]")
            trace.append(f"({llm_provider.upper()} credentials or endpoint not configured. Executing mock ReAct simulation.)")
            trace.append(f"**Selected Endpoint/Deployment:** {actual_endpoint}")
            
            if tool_map:
                first_tool_name = list(tool_map.keys())[0]
                t_db = tool_map[first_tool_name]
                trace.append(f"- **Agent Decision:** Called `{first_tool_name}` with mock arguments.")
                tool_res = run_tool_test(t_db.code, t_db.type, {}, db)
                trace.append(f"  - **Tool Result ({tool_res.get('status')}):**\n```\n{str(tool_res.get('output'))[:500]}\n```")
            trace.append(f"\n#### Final Output\n{llm_provider.upper()} served LLM model completed all tasks successfully.")
            return "\n".join(trace)

        if experiment_id and llm_provider == "databricks":
            try:
                import mlflow
                mlflow.set_tracking_uri(host)
                with mlflow.start_run(experiment_id=experiment_id, run_name=f"ReAct_Workflow_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"):
                    mlflow.log_param("instructions_length", len(instructions))
                    mlflow.log_param("tools_count", len(openai_tools))
            except Exception as mlflow_err:
                print(f"[MLflow Error] Logging react run failed: {mlflow_err}")

        messages = [
            {"role": "system", "content": instructions}
        ]
        
        prompt = ""
        if history:
            prompt += "Previous Conversation Context:\n"
            for msg in history:
                prompt += f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}\n"
            prompt += "\n"
        prompt += f"New User Request / Inputs: {json.dumps(inputs)}\nPlease complete the task using the provided tools."
        messages.append({"role": "user", "content": prompt})
        
        trace = []
        try:
            for turn in range(8):
                payload = {
                    "messages": messages,
                    "temperature": 0.1,
                    "max_tokens": 1500
                }
                if openai_tools:
                    payload["tools"] = openai_tools
                    
                print(f"[{llm_provider.upper()} ReAct] Querying '{actual_endpoint}' (turn {turn})...")
                response = requests.post(url, headers=headers, json=payload, timeout=45)
                if response.status_code != 200:
                    trace.append(f"[ERROR] {llm_provider.upper()} Serving Endpoint failed with code {response.status_code}: {response.text}")
                    break
                    
                res_data = response.json()
                choice = res_data["choices"][0] if "choices" in res_data else {}
                msg = choice.get("message", {})
                
                msg_to_append = {
                    "role": "assistant",
                    "content": msg.get("content") or ""
                }
                if msg.get("tool_calls"):
                    msg_to_append["tool_calls"] = msg.get("tool_calls")
                messages.append(msg_to_append)
                
                if msg.get("tool_calls"):
                    for tc in msg.get("tool_calls"):
                        tc_id = tc.get("id")
                        func_info = tc.get("function", {})
                        func_name = func_info.get("name")
                        
                        args_str = func_info.get("arguments") or "{}"
                        try:
                            args = json.loads(args_str) if isinstance(args_str, str) else args_str
                        except Exception:
                            args = {}
                            
                        trace.append(f"- **Agent Decision (Databricks LLM):** Called `{func_name}` with args: `{json.dumps(args)}`")
                        
                        if func_name in tool_map:
                            t_db = tool_map[func_name]
                            tool_res = run_tool_test(t_db.code, t_db.type, args, db)
                            
                            display_output = str(tool_res.get('output'))[:500]
                            if tool_res.get('variables') and "no print output" in display_output:
                                display_output += f"\nVariables: {json.dumps(tool_res.get('variables'))[:1000]}"
                            
                            trace.append(f"  - **Tool Result ({tool_res.get('status')}):**\n```\n{display_output}\n```")
                            
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc_id,
                                "name": func_name,
                                "content": json.dumps(tool_res)
                            })
                        else:
                            trace.append(f"  - **Tool Call Failed:** `{func_name}` not recognized.")
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc_id,
                                "name": func_name,
                                "content": json.dumps({"error": f"Tool {func_name} not found"})
                            })
                else:
                    content_text = msg.get("content") or ""
                    trace.append(f"\n#### Final Output\n{content_text}")
                    break
                    
            return "\n".join(trace)
        except Exception as e:
            return f"Error executing actual Databricks behavior engine: {e}\n\nTraceback: {traceback.format_exc()}"

    # Default ReAct loop using Gemini
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    try:
        chat = client.chats.create(
            model=model_name,
            config=types.GenerateContentConfig(
                system_instruction=instructions,
                tools=gemini_tools
            )
        )
        
        trace = []
        prompt = ""
        if history:
            prompt += "Previous Conversation Context:\n"
            for msg in history:
                prompt += f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}\n"
            prompt += "\n"
        
        prompt += f"New User Request / Inputs: {json.dumps(inputs)}\nPlease complete the task using the provided tools."
        response = chat.send_message(prompt)
        
        for turn in range(8):
            if response.function_calls:
                for fc in response.function_calls:
                    func_name = fc.name
                    args = {k: v for k, v in fc.args.items()} if fc.args else {}
                    trace.append(f"- **Agent Decision:** Called `{func_name}` with args: `{json.dumps(args)}`")
                    
                    if func_name in tool_map:
                        t_db = tool_map[func_name]
                        tool_res = run_tool_test(t_db.code, t_db.type, args, db)
                        
                        display_output = str(tool_res.get('output'))[:500]
                        if tool_res.get('variables') and "no print output" in display_output:
                            display_output += f"\nVariables: {json.dumps(tool_res.get('variables'))[:1000]}"
                            
                        trace.append(f"  - **Tool Result ({tool_res.get('status')}):**\n```\n{display_output}\n```")
                        
                        response = chat.send_message(
                            types.Part.from_function_response(
                                name=func_name,
                                response={"result": tool_res}
                            )
                        )
                    else:
                        trace.append(f"  - **Tool Call Failed:** `{func_name}` not recognized.")
                        response = chat.send_message(
                            types.Part.from_function_response(
                                name=func_name,
                                response={"error": f"Tool {func_name} not found"}
                            )
                        )
            else:
                trace.append(f"\n#### Final Output\n{response.text}")
                break
                
        return "\n".join(trace)
    except Exception as e:
        return f"Error executing actual behavior engine: {e}\n\nTraceback: {traceback.format_exc()}"

