import streamlit as st
import plotly.graph_objects as go
import pandas as pd
from vector_clock import VectorClock

st.set_page_config(page_title="ZerithDB Vector Clock Visualizer", layout="wide")

# State Initialization
if 'peers' not in st.session_state:
    st.session_state.peers = {}
if 'events' not in st.session_state:
    st.session_state.events = []
if 'time_step' not in st.session_state:
    st.session_state.time_step = 0

# Core Functions
def add_peer(peer_id):
    if peer_id and peer_id not in st.session_state.peers:
        st.session_state.peers[peer_id] = VectorClock(peer_id)
        st.session_state.events.append({
            "time": st.session_state.time_step,
            "type": "join",
            "peer": peer_id,
            "clock": st.session_state.peers[peer_id].get_clock()
        })
        st.session_state.time_step += 1

def local_write(peer_id):
    st.session_state.peers[peer_id].increment()
    st.session_state.events.append({
        "time": st.session_state.time_step,
        "type": "write",
        "peer": peer_id,
        "clock": st.session_state.peers[peer_id].get_clock()
    })
    st.session_state.time_step += 1

def sync_peers(p1, p2):
    c1 = st.session_state.peers[p1].get_clock()
    c2 = st.session_state.peers[p2].get_clock()
    
    c1_new = st.session_state.peers[p1].merge(c2)
    c2_new = st.session_state.peers[p2].merge(c1)

    st.session_state.events.append({
        "time": st.session_state.time_step, "type": "sync", 
        "peer": p1, "target": p2, "clock": c1_new
    })
    st.session_state.events.append({
        "time": st.session_state.time_step, "type": "sync", 
        "peer": p2, "target": p1, "clock": c2_new
    })
    st.session_state.time_step += 1

def reset_sim():
    st.session_state.peers = {}
    st.session_state.events = []
    st.session_state.time_step = 0

# UI - Sidebar
with st.sidebar:
    st.header("Controls")
    new_peer = st.text_input("New Peer ID")
    if st.button("Add Peer"): add_peer(new_peer)
    if st.button("Reset Simulation"): reset_sim()
    st.markdown("---")
    st.markdown("**Explanation**:\n- **Join**: Peer initialized.\n- **Write**: Increments local counter.\n- **Sync**: Component-wise max merge.")

peers_list = list(st.session_state.peers.keys())

# UI - Main Actions & State
col1, col2 = st.columns(2)
with col1:
    st.subheader("Simulation Actions")
    if peers_list:
        w_peer = st.selectbox("Local Write", peers_list, key="w_sel")
        if st.button(f"{w_peer} Writes"): local_write(w_peer)
        
        if len(peers_list) >= 2:
            st.markdown("---")
            sp1, sp2 = st.columns(2)
            with sp1: p1 = st.selectbox("Peer A", peers_list, key="s1")
            with sp2: p2 = st.selectbox("Peer B", peers_list, key="s2")
            if st.button("Sync A ↔ B") and p1 != p2: sync_peers(p1, p2)

with col2:
    st.subheader("Current Vector Clocks")
    if peers_list:
        df = pd.DataFrame([{"Peer": p, "Clock State": str(c.get_clock())} for p, c in st.session_state.peers.items()])
        st.dataframe(df, hide_index=True, use_container_width=True)

# UI - Space-Time Diagram
st.subheader("Space-Time Diagram")
if peers_list and st.session_state.events:
    fig = go.Figure()
    peer_x = {p: i for i, p in enumerate(peers_list)}
    
    # Timeline axes
    for p in peers_list:
        fig.add_trace(go.Scatter(x=[peer_x[p], peer_x[p]], y=[0, st.session_state.time_step],
                                 mode='lines', line=dict(color='gray', dash='dash'), hoverinfo='skip'))

    # Events mapping
    for ev in st.session_state.events:
        px, py, clk = peer_x[ev['peer']], ev['time'], str(ev['clock'])

        if ev['type'] in ['write', 'join']:
            fig.add_trace(go.Scatter(x=[px], y=[py], mode='markers+text',
                                     marker=dict(size=12, color='royalblue'), text=[clk],
                                     textposition="middle right", name=f"{ev['peer']} {ev['type']}"))
        elif ev['type'] == 'sync':
            tx = peer_x[ev['target']]
            start_y = py - 1 
            fig.add_annotation(x=tx, y=py, ax=px, ay=start_y, xref="x", yref="y", axref="x", ayref="y",
                               showarrow=True, arrowhead=2, arrowsize=1, arrowwidth=1.5, arrowcolor="firebrick")
            fig.add_trace(go.Scatter(x=[px], y=[py], mode='markers+text',
                                     marker=dict(size=10, color='firebrick'), text=[clk],
                                     textposition="top center", showlegend=False))

    fig.update_layout(yaxis=dict(autorange="reversed", title="Logical Time Step", dtick=1),
                      xaxis=dict(tickvals=list(peer_x.values()), ticktext=list(peer_x.keys()), title="Peers"),
                      height=500, showlegend=False, margin=dict(l=0, r=0, t=30, b=0))
    st.plotly_chart(fig, use_container_width=True)