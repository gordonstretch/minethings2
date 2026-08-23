<div id="fullcenter">

<div style="float:right;margin:30px;">
<h3>Items without images:</h3>
<?
foreach($unimagedItems as $i)
	echo "<div>".$html->link($i['name'], '/items/view/'.$i['id']).'</div>';
?>
</div>

<h3>Submit Art for <? echo $html->link($item['name'], '/items/view/'.$item['id']); ?></h3>
Earn <? echo $artPrice; ?> credits if your image is chosen!<BR>
Current Submissions: <? echo $submissionCount; ?><br>
No photos please.  See <? echo $html->link('this post', 'http://www.minethings.com/app/webroot/forums/viewtopic.php?p=3169#p3169'); ?> for an example of the sorts of styles accepted.<br>
<br>
<h3>Terms of Agreement</h3>
1. Any uploaded file will be stored on the Minethings.com server for evaluation purposes for as long as deemed necessary by Minethings.com or until the artist deletes the file himself/herself.<br>
2. Minethings.com is free to decide whether it wants to use any submitted image.<br>
3. If and when an image is chosen, the artist will receive <? echo $artPrice; ?> credits.  At that point the image becomes the exclusive property of Minethings.com.<br>
4. If, after approving the image, Minethings.com determines that the image did not originally belong to the artist, Minethings.com will no longer use the image and the artist will lose the <? echo $artPrice; ?> credits received.  If the artist does not have enough credits, his/her cheapest mine will be sold for the necessary credits.  Please submit only your original content!<br>
5. After purchasing an image, Minethings.com may decide to use a different image instead.  In this general case, the artist keeps the <? echo $artPrice; ?> credits received.<br>
<BR>
Submitted image must be <? echo $desiredSize[0]; ?>x<? echo $desiredSize[1]; ?> (width x height) and <? echo $maxKB; ?>kb or less.<BR>
<?
echo $form->create('Images', array('action' => 'submit/'.$item['id'], 'type' => 'file'));
echo $form->file('image.filename'); 

echo $form->input('Agree to Terms', array('type' => 'checkbox'));
if (isset($message)) echo "<font color=red>".$message."</font><BR>";
echo $form->end('Submit');

echo "<BR><BR>";
if (count($images))
	echo "Your submissions:<BR>";
foreach($images as $s)
{
	echo $html->image($s['filename']);
	echo "<BR>";
	if ($isAdministrator)
	{
		echo $html->link($s['minerName'], '/miners/profile/'.$s['minerName'])." ";
		if ($s['approved'])
		{
			echo $html->link('UNapprove', '/images/unapprove/'.$s['id'], array(), 'Unapprove Image?')." ";
			echo $html->link('Propagate', '/images/propagate/'.$s['id'], array(), 'Send to all other dimensions?')." ";
		}
		else
			echo $html->link('approve', '/images/approve/'.$s['id'], array(), 'Approve and Pay Credits?')." ";
	}
	echo $html->link('delete', '/images/deleteImage/'.$s['id'], array(), 'Delete?');
	echo "<BR>";
	echo "<BR>";
}

?>

</div>