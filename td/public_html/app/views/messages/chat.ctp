<div id="fullcenter">

<div style="float:right">
<? 
echo $form->create('Message', array('action' => 'chat/'.$otherName));
echo $form->input('Miner.block', array('type' => 'hidden', 'value' => $otherBlocked ? 0 : 1));
echo $form->end($otherBlocked ? 'Unblock messages from '.$otherName : 'Block messages from '.$otherName);
?>
</div>

<h3 style="display:inline">Conversation with <? echo $html->link($otherName, '/miners/profile/'.$otherName); ?></h3>

<?
echo $form->create('Message', array('action' => 'chat/'.$otherName));
//echo $form->input('body');
echo $form->textarea( 'body', array(
	'label' => '', 
	'cols' => '80', 
	'rows' => '8',
	'disabled' => $minerBlocked !== false,
	) );
echo $form->error('Message.body');
if ($minerBlocked['PmBlock']['blocker_id'])
	echo '</form>This miner has blocked your PMs.';
else if ($minerBlocked && $minerBlocked['PmBlock']['blocker_id'] == 0)
	echo '</form>The ability to send PMs has been disabled for this account.';
else
	echo $form->end('Send');
echo "<BR>";

foreach($messages as $m)
	{
	// replace newlines with <br>
	$m['body'] = preg_replace('/\n/', '<br>', $m['body']);

	echo $html->link($m['from'], '/miners/profile/'.$m['from'])." (".$m['fromScore'].")";
	echo " - ";
	echo $m['time'];
	echo "<br>";
	echo $m['body'];
	echo "<br><BR>";
	}

$paginator->options['url'] = "/$otherName";
echo $paginator->numbers(); 
echo '<br>'.$paginator->prev('<< Previous ');
echo ' '.$paginator->next(' Next >>');
echo '<br>'.$paginator->counter(); 
?>

</div>