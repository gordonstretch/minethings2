
<? echo $javascript->link('textCounter.js'); ?>

<div id="fullcenter">

Advertise <? echo $html->link($productName, '/'.$productRrl); ?><BR>
<p>For <? echo $adPrice; ?> credit<? if($adPrice != 1) echo 's'; ?>, your ad will appear on the home page of <? echo $cityName; ?> for <? echo $adDurationDAYS; ?> days.</p>
<? if ($daysUntilMature > 0) echo "<p><b>This is not available for miners who are less than $minAgeDays days old.  You have $daysUntilMature days to go.</b></p>"; ?>
<p>Please use 50 characters or less to tell miners what you want.</p>
<p>Your words will form a link to the <?echo $productName?>.</p>
<script language="Javascript">PrintCharacterCounter(50);</script> characters left<BR>
<?
echo $form->create('Ad', array('action' => 'advertise/'.$marketableId));
echo $form->input('text', array('id' => false, 'type' => 'text', 'label' => '', 'maxLength' => '50', 'size' => '50', 'onKeyDown' => 'OnChar(this, 50);', 'onKeyUp' => 'OnChar(this, 50);'));
?>Minethings.com has the right to remove (without refund) any ad deemed inappropriate.<BR><?
echo $form->submit('Purchase');
if (isset($message)) echo $message;

?>

</div>