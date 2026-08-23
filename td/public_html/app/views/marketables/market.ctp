<div id="fullcenter">

<div style="float:right">
<? echo $html->link('advertise this', '/ads/advertise/'.$marketableId); ?>
<BR>
<? 
if ($isAdministrator)
{
	echo $form->create(null, array('action' => 'market/'.$marketableId));
	echo $form->input('ban', array('type' => 'hidden', 'value' => $isBanned ? 0 : 1));
	echo $form->end($isBanned ? 'Unban Market' : 'Ban Market');
}
?>
</div>


<h3><? echo $html->link($marketableDetails['name'], '/'.$marketableDetails['rrl']); ?> Market</h3>
<?
if ($isWatching)
	echo '<input type="button" value="Watching This" disabled><BR>';
else if ($hasLedger)
{ 
	echo $form->create(null, array('action' => 'market/'.$marketableId)); 
	echo $form->input('watch', array('type' => 'hidden', 'value' => 1)); 
	echo $form->end('Watch This'); 
}
?>
<p><? echo preg_replace('/\n/', '<BR>', $marketableDetails['instructions']); ?></p>

<? echo $this->element('market'); ?>

</div>
