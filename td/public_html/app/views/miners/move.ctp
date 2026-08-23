<div id="fullcenter">

<h3>Move to <? echo $city['name']?></h3>
Would you like to make <?echo $city['name'];?> your new home?  

Moving to <? echo $city['name']; ?> does the following:<BR>
<BR>
<list>
<li>Changes your home city from <? echo $homeCity['name']; ?> to <? echo $city['name']; ?>.
<li>Moves the mining bonus you have from clearing stones to your top mine in <? echo $city['name']; ?>.
<li>Nullifies all your melds.  These nullified melds will be in your home city (<? echo $homeCity['name']; ?>).  From your profile page they can then be individually dismantled back into the things that were required to make them.
<li>Sets your meld count to zero.
<li>Reverts your profession back to Bum.  Vehicles en-route retain their profession until arrival.
<li>Dismantles your avatar, leaving the components in your former home city.
<li>Disables moving for the next week.
</list>
<p>Must not own any active/rented factories or be working at a factory.</p>
<br>
<?
echo $form->create(null, array('action' => 'move'));
echo $form->input('City.id', array('type' => 'hidden', 'value' => $city['id']));
if ($youLiveHere)
	echo '<input type="button" value="You live here" disabled/>';
else
	echo $form->end('Move to '.$city['name']);
if(isset($message))
	print "<font color=red>$message</font>";
?>
<br>
For more information, see <? echo $html->link('Help', '/miners/help'); ?>.

</div>