import React from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import type {StoryMoment} from '../domain/storyMoments';

type Props={visible:boolean;moments:StoryMoment[];
 onClose:()=>void;onPreview:(m:StoryMoment)=>void;onCreate:(m:StoryMoment)=>void};
const time=(ms:number):string=>{
 const s=Math.max(0,Math.floor(ms/1000));
 return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
};
export function StoryFinderSheet({visible,moments,onClose,onPreview,onCreate}:Props){
 const insets=useSafeAreaInsets();
 return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
  <View style={styles.backdrop}>
   <View style={[styles.sheet,{paddingBottom:Math.max(18,insets.bottom+10)}]}>
    <View style={styles.header}>
     <View><Text style={styles.title}>Story Finder</Text>
      <Text style={styles.description}>Editable shorts from complete spoken thoughts</Text></View>
     <Pressable accessibilityLabel="Close story finder" onPress={onClose}>
      <Ionicons name="close" color="#FFFFFF" size={26}/></Pressable>
    </View>
    <Text style={styles.warning}>VIDNIVO suggests sentence-bounded moments using your existing captions.
      It doesn't claim to judge emotion, virality or what your audience will like.
      Watch each suggestion before using it.</Text>
    <ScrollView style={{maxHeight:420}} contentContainerStyle={{gap:10,paddingVertical:5}}>
     {moments.length===0?<View style={styles.card}>
      <Text style={styles.detail}>No complete moments detected. Import or generate captions with sentence punctuation,
        and use at least 12 seconds of uninterrupted footage.</Text>
     </View>:null}
     {moments.map((m,i)=><View key={m.id} style={styles.card}>
      <Text style={styles.time}>MOMENT {i+1} · {time(m.startMs)}–{time(m.endMs)} · {Math.round((m.endMs-m.startMs)/1000)}s</Text>
      <Text style={styles.excerpt}>{m.preview}</Text>
      <Text style={styles.detail}>{m.explanation}</Text>
      <View style={styles.actions}>
       <Pressable accessibilityRole="button" accessibilityLabel={'Review story moment '+(i+1)}
        onPress={()=>onPreview(m)} style={styles.secondary}>
        <Ionicons name="play-outline" size={18} color="#2DD7E8"/>
        <Text style={styles.secondaryText}>Preview</Text></Pressable>
       <Pressable accessibilityRole="button" accessibilityLabel={'Create short from story moment '+(i+1)}
        onPress={()=>onCreate(m)} style={styles.primary}>
        <Ionicons name="copy-outline" size={17} color="#07262B"/>
        <Text style={styles.primaryText}>Create editable short</Text></Pressable>
      </View>
     </View>)}
    </ScrollView>
    <Text style={styles.footer}>Source videos remain unchanged. Each new short is its own project
      with editable video, audio and subtitle layers. Local source media must remain on this phone.</Text>
   </View>
  </View>
 </Modal>;
}
const styles=StyleSheet.create({
 backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'#000000A9'},
 sheet:{maxHeight:'90%',backgroundColor:'#20252B',padding:16,borderTopLeftRadius:24,
 borderTopRightRadius:24,gap:12},
 header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 title:{color:'#F6F8FA',fontSize:21,fontWeight:'800'},
 description:{color:'#ADBAC4',fontSize:12},
 warning:{padding:11,borderRadius:9,backgroundColor:'#34414A',fontSize:12,
  lineHeight:18,color:'#E3EDF3'},
 card:{padding:12,borderRadius:12,backgroundColor:'#303840',gap:8},
 time:{fontSize:11,fontWeight:'800',color:'#36D6E6',letterSpacing:.4},
 excerpt:{color:'#F5F8FA',fontWeight:'600',fontSize:14,lineHeight:21},
 detail:{color:'#AAB8C5',fontSize:12,lineHeight:18},
 actions:{flexDirection:'row',gap:10,alignItems:'center',marginTop:5},
 secondary:{padding:10,borderColor:'#677580',borderWidth:1,borderRadius:8,flexDirection:'row',alignItems:'center',gap:4},
 secondaryText:{fontSize:12,color:'#F1F6F8',fontWeight:'700'},
 primary:{flex:1,padding:10,backgroundColor:'#2AD5E7',borderRadius:8,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
 primaryText:{fontSize:12,fontWeight:'800',color:'#05232A'},
 footer:{fontSize:11,color:'#8997A2',lineHeight:16}
});
