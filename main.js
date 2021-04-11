import './style.css'
import firebase from 'firebase/app';
import 'firebase/firestore'

// document.querySelector('#app').innerHTML = `
//   <h1>Hello Vite!</h1>
//   <a href="https://vitejs.dev/guide/features.html" target="_blank">Documentation</a>
// `

const firebaseConfig = {
  apiKey: "AIzaSyAPKvIeCqF2_HRVcqoGYpGzshw1JAO58QU",
  authDomain: "webrtc-video-chat-67130.firebaseapp.com",
  projectId: "webrtc-video-chat-67130",
  storageBucket: "webrtc-video-chat-67130.appspot.com",
  messagingSenderId: "718293256703",
  appId: "1:718293256703:web:6e74c6c388210ff1a37fca"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    }
  ]
}

let  peerConnection = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

const webcamBtn = document.getElementById('webcamBtn');
const webcamVid = document.getElementById('webcamVid');
const remoteVid = document.getElementById('remoteVid');
const callBtn = document.getElementById('callBtn');
const callInput = document.getElementById('callInput');
const answerBtn = document.getElementById('answerBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

// Media sources

webcamBtn.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true})
  remoteStream = new MediaStream()

  // Local stream to peer connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream)
  });

  // Peer conection to local video stream
  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVid.srcObject = localStream;
  remoteVid.srcObject = remoteStream;
  callBtn.disabled = false;
  answerBtn.disabled = false;
  webcamBtn.disabled = true;
}

// Offer creation

callBtn.onclick = async () => {
  // firestore reference
  const calls = firestore.collection('calls').doc();
  const offerCandidates = calls.collection('offerCandidates');
  const answerCandidates = calls.collection('answerCandidates');

  callInput.value = calls.id;

  // Get candidates for caller & save to DB
  peerConnection.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  }

  // Make an offer
  const offerDescription = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await calls.set({ offer })

  // Listen to remote answer
  calls.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!peerConnection.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      peerConnection.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        peerConnection.addIceCandidate(candidate);
      }
    })
  });

  disconnectBtn.disabled = false;
};

// Answer the call with unique id

answerBtn.onclick = async () => {
  const callId = callInput.value;
  const call = firestore.collection('calls').doc(callId);
  const answerCandidates = call.collection('answerCandidates');
  const offerCandidates = call.collection('offerCandidates');

  peerConnection.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await call.get()).data();

  const offerDescription = callData.offer;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await call.update({ answer })

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        peerConnection.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};