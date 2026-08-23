<?
$args ='';
foreach($this->passedArgs as $k => $v)
	$args.= "/$k:$v";
echo $ajax->form('delete_selected'.$args, 'post', array(
	'id' => 'MessageForm', 
	'indicator' => 'LoadingDiv',
	'update' => 'messagelist'));  
echo $form->input('readNotDelete', array('type' => 'hidden', 'value' => '0'));
?>

<?
$updateUI = $ajax->remoteFunction(array(
	'url' => '/php/updateUI.php?minerId='.$minerId,
	'update' => array('FindingsDiv', 'MessagesDiv'),
	)); ?>
	
<script type="text/javascript">
<? echo $updateUI; // run this on every request ?>
</script>


<!-- mark read and delete buttons -->
<input type=button onclick="$('readNotDelete').setValue(1); $('MessageFormSubmit').click(); " value="Mark Read"/>
<input type=button onclick="$('MessageFormSubmit').click();" value="Delete"/>

<!-- messages -->
<table>
<?
if (count($messages) == 0) 
	echo "<tr><td>You have 0 messages</td></tr>";
else
	{
	$allBox = '<input type=checkbox onclick="CheckAll(forms[\'MessageForm\']);" name="allbox">';
	echo $html->tableHeaders( array($allBox, 'From', 'Subject', 'Sent', 'Delete', 'Mark') );
	}
foreach ($messages as $message){
	$mid = $message['id'];
	$deleteCheckbox = $form->checkbox('Message.'.$mid.'.deleted', array('label' => '', 'value' => 0));

	$subject = $html->link($message['subject'], '/messages/view/'.$mid);
	$unreadSubject = "> $subject";
	$read = $message['read'];

	$readLink = $ajax->link('read', 'js_mark_read/'.$mid.'/1', array(
		'id' => 'read'.$mid,
		'style' => 'display:'.($read?'none':'block'),
		'onclick' => '$("read'.$mid.'").hide(); $("unread'.$mid.'").show(); $("subject'.$mid.'").update(\''.$subject.'\'); ',
		'complete' => $updateUI,
		));
	$unreadLink = $ajax->link('unread', 'js_mark_read/'.$mid.'/0', array(
		'id' => 'unread'.$mid,
		'style' => 'display:'.($read?'block':'none'),
		'onclick' => '$("unread'.$mid.'").hide(); $("read'.$mid.'").show(); $("subject'.$mid.'").update(\''.$unreadSubject.'\'); ',
		'complete' => $updateUI,
		));
	
	echo $html->tableCells(array( array(
		$deleteCheckbox,
		$message['from'], 
		array($read ? $subject : $unreadSubject , array('id' => 'subject'.$mid)),
		date('y/n/d H:i', strtotime($message['sent'])),
		$ajax->link('delete', 'js_del/'.$mid, array(
			'onclick' => '$("row'.$mid.'").hide();',
			'complete' => $updateUI,
			)),
		$readLink.$unreadLink,
		) ),
		array('id' => 'row'.$message['id']),
		array('id' => 'row'.$message['id'])
		);
	
}
?>
</table>
<? echo $form->end(array('style' => 'display:none', 'id' => 'MessageFormSubmit')); ?>

<!-- mark read and delete buttons -->
<input type=button onclick="$('readNotDelete').setValue(1); $('MessageFormSubmit').click();" value="Mark Read"/>
<input type=button onclick="$('MessageFormSubmit').click();" value="Delete"/>
<BR>
<BR>
<?
$paginator->options(array(
	'update' => 'messagelist', 
	'indicator' => 'LoadingDiv',
	'url' => array('controller' => 'messages', 'action' => 'js_list_all')));
echo $paginator->prev('<< Previous', null, '<< Previous ', array('tag' => 'span'));
echo ' '.$paginator->numbers(); 
echo ' '.$paginator->next('Next >>', null, ' Next >>', array('tag' => 'span'));
?>