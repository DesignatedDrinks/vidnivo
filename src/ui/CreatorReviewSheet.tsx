import React from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import type {CreatorReview,CreatorIssue} from '../domain/creatorReview';

interface Props {visible:boolean;report:CreatorReview;onClose:()=>void;onJump:(timeMs:number)=>void;
 onExport:()=>void;busy:boolean}
const palette={blocker:'#F49E8D',review:'#F4C16F',tip:'#9DD9D5'};
const label={blocker:'NEEDS FIX',review:'CHECK',tip:'TIP'};
const time=(ms:number)=>{const seconds=Math.floor(ms/1000);
 return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');};
export function CreatorReviewSheet({visible,report,onClose,onJump,onExport,busy}:Props){
 const insets=useSafeAreaInsets();
 return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
  <View style={styles.backdrop}>
   <View style={[styles.sheet,{paddingBottom:Math.max(18,insets.bottom+10)}]}>
    <View style={styles.heading}>
     <View><Text style={styles.title}>Creator Review</Text>
      <Text style={styles.sub}>Check the video before publishing</Text></View>
     <Pressable onPress={onClose} accessibilityLabel="Close creator review" style={styles.close}>
      <Ionicons name="close" size={25} color="#F4F4F5"/></Pressable>
    </View>
    <View style={styles.summary}>
     <Text style={[styles.summaryText,{color:report.blockers?palette.blocker:'#A8DFB9'}]}>
      {report.blockers?report.blockers+' export blocker(s)':'Ready for an export attempt'}</Text>
     <Text style={styles.sub}>{report.reviews} checks · {report.tips} suggestions</Text>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={{paddingBottom:14}} keyboardShouldPersistTaps="handled">
     {report.issues.map((item:CreatorIssue)=><View key={item.id} style={styles.item}>
      <View style={styles.itemTitle}>
       <Text style={[styles.severity,{color:palette[item.severity]}]}>{label[item.severity]}</Text>
       {item.atMs!==null?<Pressable accessibilityRole="button"
        accessibilityLabel={'Review at '+time(item.atMs)}
        onPress={()=>{onJump(item.atMs!);onClose();}} style={styles.goto}>
        <Ionicons name="play-circle-outline" size={16} color="#24D2E5"/>
        <Text style={styles.gotoText}>{time(item.atMs)}</Text></Pressable>:null}
      </View>
      <Text style={styles.itemHeader}>{item.title}</Text>
      <Text style={styles.itemCopy}>{item.detail}</Text>
     </View>)}
     <Text style={styles.disclaimer}>
      These checks inspect project metadata and subtitle timing only. They do not judge
      picture quality, verify spoken words, detect reactions, or guarantee exported audio/video sync.
      Watch the rendered MP4 before posting.
     </Text>
    </ScrollView>
    <View style={styles.footer}>
     <Pressable accessibilityRole="button" style={styles.secondary} onPress={onClose}>
      <Text style={styles.secondaryText}>Back to editing</Text></Pressable>
     <Pressable accessibilityRole="button" style={[styles.primary,(!report.canExport||busy)&&styles.disabled]}
      onPress={onExport} disabled={!report.canExport||busy}>
      <Text style={styles.primaryText}>Export MP4</Text></Pressable>
    </View>
   </View>
  </View>
 </Modal>;
}
const styles=StyleSheet.create({
 backdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'#000000B0'},
 sheet:{maxHeight:'88%',backgroundColor:'#20242A',borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,gap:12},
 heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 title:{fontSize:21,fontWeight:'800',color:'#F6F9FB'},
 sub:{fontSize:12,color:'#ADB6BF',marginTop:3},
 close:{padding:7},
 summary:{backgroundColor:'#15191E',padding:12,borderRadius:10},
 summaryText:{fontSize:14,fontWeight:'700'},
 scroll:{flexGrow:0},
 item:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#383C43',gap:5},
 itemTitle:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 severity:{fontSize:10,fontWeight:'800',letterSpacing:1},
 goto:{flexDirection:'row',gap:5,alignItems:'center',padding:4},
 gotoText:{color:'#24D2E5',fontWeight:'700',fontSize:12},
 itemHeader:{fontSize:14,fontWeight:'700',color:'white'},
 itemCopy:{color:'#B9C4CD',fontSize:12,lineHeight:18},
 disclaimer:{fontSize:11,lineHeight:17,color:'#929FAA',marginTop:15},
 footer:{flexDirection:'row',gap:10,paddingTop:8},
 secondary:{flex:1,borderColor:'#5B6873',borderWidth:1,borderRadius:10,paddingVertical:12,alignItems:'center'},
 secondaryText:{color:'#F6F8FA',fontWeight:'700'},
 primary:{flex:1,backgroundColor:'#25D2E6',borderRadius:10,paddingVertical:12,alignItems:'center'},
 primaryText:{color:'#0A2528',fontWeight:'800'},
 disabled:{opacity:.38}
});
