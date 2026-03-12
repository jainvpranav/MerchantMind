# ml/agents/recovery_agent.py
import anthropic, psycopg2, json, os
from dotenv import load_dotenv
load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
MERCHANT_ID = os.getenv('MERCHANT_ID')

# Tool definitions — these are what Claude can call
tools = [
  {
    'name': 'get_at_risk_customers',
    'description': 'Returns customers whose RFM segment is at_risk for this merchant',
    'input_schema': { 'type': 'object', 'properties': {}, 'required': [] }
  },
  {
    'name': 'draft_winback_campaign',
    'description': 'Saves a personalised win-back campaign draft to the database',
    'input_schema': {
      'type': 'object',
      'properties': {
        'target_segment': {'type': 'string'},
        'message_body':   {'type': 'string'},
        'reasoning':      {'type': 'string'}
      },
      'required': ['target_segment','message_body','reasoning']
    }
  }
]

def handle_tool(tool_name, tool_input):
    conn = psycopg2.connect(os.getenv('DB_URL'))
    cur  = conn.cursor()

    if tool_name == 'get_at_risk_customers':
        cur.execute('''
          SELECT customer_hash, avg_basket, visit_count,
                 EXTRACT(DAY FROM NOW()-last_seen) as days_absent
          FROM customer_segments
          WHERE merchant_id=%s AND segment='at_risk'
          ORDER BY avg_basket DESC LIMIT 20
        ''', (MERCHANT_ID,))
        rows = cur.fetchall()
        return json.dumps([{'customer':r[0],'avg_basket':float(r[1]),'visits':r[2],'days_absent':float(r[3])} for r in rows])

    elif tool_name == 'draft_winback_campaign':
        import uuid
        cur.execute('''
          INSERT INTO campaigns (id,merchant_id,agent_type,status,target_segment,message_body)
          VALUES (%s,%s,%s,%s,%s,%s)
        ''', (str(uuid.uuid4()), MERCHANT_ID, 'recovery', 'draft',
              tool_input['target_segment'], tool_input['message_body']))
        conn.commit()
        return json.dumps({'status':'saved','message': tool_input['message_body']})

    conn.close()

def run_recovery_agent():
    messages = [{
        'role': 'user',
        'content': '''You are a marketing agent for a small retail merchant.
        Your job is to identify at-risk customers and create personalised win-back campaigns.
        1. First, get the list of at-risk customers.
        2. Analyse their purchase patterns.
        3. Draft one warm, personalised WhatsApp message to win them back.
        Keep the message under 160 characters, friendly, and include a small incentive.'''
    }]

    # Agentic loop — keeps running until Claude stops calling tools
    while True:
        response = client.messages.create(
            model='claude-sonnet-4-20250514',
            max_tokens=1000,
            tools=tools,
            messages=messages
        )

        # Add Claude's response to history
        messages.append({'role':'assistant','content':response.content})

        if response.stop_reason == 'end_turn':
            print('Agent complete.')
            break

        # Process any tool calls
        tool_results = []
        for block in response.content:
            if block.type == 'tool_use':
                result = handle_tool(block.name, block.input)
                tool_results.append({'type':'tool_result','tool_use_id':block.id,'content':result})
                print(f'Tool called: {block.name}')

        if tool_results:
            messages.append({'role':'user','content':tool_results})
        else:
            break

if __name__ == '__main__':
    run_recovery_agent()
    print('Check campaigns table: SELECT * FROM campaigns;')
